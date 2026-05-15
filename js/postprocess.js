const MODEL = "gpt-4o-mini";
const MAX_CHARS = 100000;

const SPEAKER_PROMPT = `You are analyzing a transcript of an informational interview. 
One speaker is a college student (the user of this app) asking questions and learning. 
The other speaker is a professional being interviewed, sharing their experience and advice.

Based on context clues in the conversation (who asks questions, who shares career experience, 
who mentions being a student, etc.), identify which segments belong to each role.

Return a JSON object:
{
  "student_indicators": ["...phrases that identify the student..."],
  "professional_indicators": ["...phrases that identify the professional..."],
  "labeled_transcript": [
    { "speaker": "Me", "text": "..." },
    { "speaker": "Them", "text": "..." }
  ]
}

Respond ONLY with valid JSON. No preamble.

Transcript:
`;

const INSIGHTS_PROMPT = `You are reviewing a transcript of an informational interview. 
Extract the most useful, actionable, and memorable things the professional said.
Focus on: career advice, specific recommendations, names/resources mentioned, 
warnings or lessons learned, and things the student should follow up on.

Return a JSON object:
{
  "key_insights": ["...", "...", "..."],
  "action_items": ["...", "..."],
  "resources_mentioned": ["...", "..."]
}

Respond ONLY with valid JSON. No preamble.

Transcript:
`;

const FORMAT_PROMPT = `Format this informational interview transcript as a clean, readable Markdown document.
Use the labeled transcript and insights provided.

Rules:
- Use "**Me:**" and "**Them:**" as speaker labels
- Group related exchanges under natural topic headings (infer from content)
- Put the Key Insights section at the bottom
- Keep the professional's name/company if they mentioned it, otherwise use "Them"
- Date and duration go at the top

Respond ONLY with the formatted Markdown. No preamble.
`;

export async function runPostProcessing(apiKey, transcript, metadata) {
  const labeled = await classifySpeakers(apiKey, transcript);
  const insights = await extractInsights(apiKey, transcript);
  const markdown = await formatMarkdown(apiKey, labeled, insights, metadata);

  return {
    labeled,
    insights,
    markdown,
  };
}

async function classifySpeakers(apiKey, transcript) {
  const chunks = splitTranscript(transcript);
  const combined = {
    student_indicators: [],
    professional_indicators: [],
    labeled_transcript: [],
  };

  for (const chunk of chunks) {
    const content = await callOpenAI(apiKey, `${SPEAKER_PROMPT}${chunk}`);
    const json = safeJsonParse(content);
    combined.student_indicators.push(...(json.student_indicators || []));
    combined.professional_indicators.push(...(json.professional_indicators || []));
    combined.labeled_transcript.push(...(json.labeled_transcript || []));
  }

  combined.student_indicators = dedupe(combined.student_indicators);
  combined.professional_indicators = dedupe(combined.professional_indicators);

  return combined;
}

async function extractInsights(apiKey, transcript) {
  const chunks = splitTranscript(transcript);
  const combined = {
    key_insights: [],
    action_items: [],
    resources_mentioned: [],
  };

  for (const chunk of chunks) {
    const content = await callOpenAI(apiKey, `${INSIGHTS_PROMPT}${chunk}`);
    const json = safeJsonParse(content);
    combined.key_insights.push(...(json.key_insights || []));
    combined.action_items.push(...(json.action_items || []));
    combined.resources_mentioned.push(...(json.resources_mentioned || []));
  }

  combined.key_insights = dedupe(combined.key_insights);
  combined.action_items = dedupe(combined.action_items);
  combined.resources_mentioned = dedupe(combined.resources_mentioned);

  return combined;
}

async function formatMarkdown(apiKey, labeled, insights, metadata) {
  const labeledText = labeled.labeled_transcript
    .map((entry) => `${entry.speaker}: ${entry.text}`)
    .join("\n");

  const chunks = splitTranscript(labeledText);
  if (chunks.length > 1) {
    const transcriptParts = [];
    for (let i = 0; i < chunks.length; i++) {
      const context = buildFormatPrompt(metadata, chunks[i], null, true, i + 1, chunks.length);
      transcriptParts.push(await callOpenAI(apiKey, context));
    }
    const insightsSection = buildInsightsMarkdown(insights);
    return `${transcriptParts.join("\n\n")}\n\n${insightsSection}`.trim();
  }

  const context = buildFormatPrompt(metadata, labeledText, insights, false, 1, 1);
  return callOpenAI(apiKey, context);
}

function buildFormatPrompt(metadata, labeledText, insights, omitInsights, part, total) {
  const metaBlock = `Date: ${metadata.date}\nDuration: ${metadata.duration}`;
  const partNote = total > 1 ? `\nThis is part ${part} of ${total}.` : "";
  const insightsBlock = omitInsights
    ? "\n\nDo not include a Key Insights section in your response."
    : `\n\nInsights JSON:\n${JSON.stringify(insights, null, 2)}`;

  return [
    FORMAT_PROMPT,
    partNote,
    "\nMetadata:\n",
    metaBlock,
    "\n\nLabeled Transcript:\n",
    labeledText,
    insightsBlock,
  ].join("");
}

function buildInsightsMarkdown(insights) {
  const lines = ["## Key Insights", ""]; 
  (insights?.key_insights || []).forEach((item) => lines.push(`- ${item}`));
  lines.push("", "## Action Items", "");
  (insights?.action_items || []).forEach((item) => lines.push(`- [ ] ${item}`));
  lines.push("", "## Resources Mentioned", "");
  (insights?.resources_mentioned || []).forEach((item) => lines.push(`- ${item}`));
  return lines.join("\n");
}

function splitTranscript(transcript) {
  if (transcript.length <= MAX_CHARS) {
    return [transcript];
  }
  const chunks = [];
  for (let i = 0; i < transcript.length; i += MAX_CHARS) {
    chunks.push(transcript.slice(i, i + MAX_CHARS));
  }
  return chunks;
}

async function callOpenAI(apiKey, prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "OpenAI API request failed");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function safeJsonParse(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error("Invalid JSON returned from OpenAI");
  }
}

function dedupe(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

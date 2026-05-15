# AI Informational Interview Assistant — Project Blueprint
**Version**: 1.0
**GitHub Repo**: `AI-informational-interview-AI-assistant`
**Date**: May 2026

---

## 1. Project Overview

A lightweight Progressive Web App (PWA) that runs in your phone's browser and can be installed to your home screen like a native app. You open it before an informational interview, enter your OpenAI API key once, and tap Record. As the conversation happens, transcribed text streams live onto your screen. When you tap End, the app runs two AI jobs in the background: one to figure out which speaker is you and which is the professional you're talking to, and one to pull out the most useful things they said. The result is a cleanly formatted Markdown file you can download and reference later. Everything stays on your device — no cloud storage, no accounts, no third-party data sharing beyond what you send to OpenAI for transcription and analysis.

---

## 2. App Name & Branding

- **Display name**: AI Informational Interview Assistant
- **Short name** (shown under home screen icon): Interview AI
- **GitHub repo**: `AI-informational-interview-AI-assistant`
- **PWA manifest name**: "AI Interview Assistant"

---

## 3. Licensing & Distribution

- **License**: MIT (open source, permissive)
- **Distribution**: Not published to any app store. Hosted as a static site (GitHub Pages is the simplest option — just push `index.html` and the service worker). Accessed via URL, installed to home screen via browser's "Add to Home Screen" prompt.
- **API key safety**: The user's OpenAI API key is stored only in the browser's `localStorage` on their own device. It is never logged, never sent to any server except OpenAI's API. The README must include a clear warning: "Never commit your API key to GitHub."
- **OpenAI terms**: Usage is subject to OpenAI's API usage policies. The app is a personal tool, not a commercial product, so no additional licensing considerations apply.

---

## 4. Core User Flow

```
1. User opens the app URL on their phone browser
2. [First run only] → First-Run Wizard → API key entry
3. Home screen appears → "New Interview" button
4. [Optional] User types interviewee name and company
5. User taps "Start Recording"
   → App requests microphone permission (if not already granted)
   → WebSocket opens to OpenAI GPT-Realtime-Whisper API
   → MediaRecorder starts recording raw audio as a backup
   → Live transcript text streams onto the screen in real time
6. User conducts the interview
   → If API drops mid-interview:
      → Yellow warning banner: "Live transcription paused — audio is still being saved"
      → MediaRecorder continues running silently
      → App attempts one automatic reconnect after 5 seconds
7. User taps "End Interview"
   → WebSocket closes
   → MediaRecorder stops and audio blob is held in memory
   → Post-processing begins (spinner shown):
      a. Send full raw transcript to GPT-4o-mini → Speaker classification
      b. Send transcript to GPT-4o-mini → Key insights extraction
      c. Send transcript + both AI outputs to GPT-4o-mini → Format as Markdown
   → Results screen appears
8. Results screen shows:
   → Formatted transcript preview (speaker-labeled)
   → Key insights list
   → "Download Transcript" button → saves .md file to device Downloads folder
   → [If audio was saved due to API drop] → "Download Audio Backup" button
9. User downloads the file and is done
```

---

## 5. Backends

### 5a. Live Transcription

| Feature | Details |
|---|---|
| **Model** | GPT-Realtime-Whisper (OpenAI Realtime API) |
| **How it works** | WebSocket connection; audio streamed in real time; transcript tokens returned as they're spoken |
| **Cost** | $0.017 per minute → ~$0.77 for a 45-min interview |
| **Latency** | ~300ms from speech to text appearing on screen |
| **Languages** | 57+ languages; auto-detected |
| **Diarization** | ❌ Not built in — speaker separation is handled by post-processing |
| **Model string** | Verify exact string against OpenAI docs at build time; announced as `gpt-realtime-whisper` or similar |
| **API reference** | https://platform.openai.com/docs/guides/realtime |

**WebSocket setup (pseudocode):**
```javascript
const ws = new WebSocket(
  'wss://api.openai.com/v1/realtime?model=gpt-realtime-whisper',
  ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
);
// Stream audio: send PCM16 chunks as base64 via input_audio_buffer.append events
// Receive: conversation.item.input_audio_transcription.delta events → append to transcript
```

> ⚠️ **Note for implementer**: The OpenAI Realtime API requires audio in PCM16 format at 24kHz mono. Use the Web Audio API (`AudioContext`, `ScriptProcessorNode` or `AudioWorklet`) to convert MediaRecorder output to the correct format before sending. This is the single most technically complex part of the build — plan extra time here.

### 5b. Post-Processing (Speaker Classification + Insights + Formatting)

| Feature | Model | Estimated cost per interview |
|---|---|---|
| Speaker classification | GPT-4o-mini | ~$0.01 |
| Key insights extraction | GPT-4o-mini | ~$0.01 |
| Markdown formatting | GPT-4o-mini | ~$0.01 |
| **Total post-processing** | | **~$0.03** |

**Total per interview: ~$0.80 (dominated by live transcription)**

#### Speaker Classification Prompt
```
You are analyzing a transcript of an informational interview. 
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
[TRANSCRIPT HERE]
```

#### Key Insights Prompt
```
You are reviewing a transcript of an informational interview. 
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
[TRANSCRIPT HERE]
```

#### Markdown Formatting Prompt
```
Format this informational interview transcript as a clean, readable Markdown document.
Use the labeled transcript and insights provided.

Rules:
- Use "**Me:**" and "**Them:**" as speaker labels
- Group related exchanges under natural topic headings (infer from content)
- Put the Key Insights section at the bottom
- Keep the professional's name/company if they mentioned it, otherwise use "Them"
- Date and duration go at the top

Respond ONLY with the formatted Markdown. No preamble.
```

---

## 6. Text Delivery / Output

- **During interview**: Transcript text streams into a scrolling `<div>` on screen. Auto-scrolls to latest text. Speaker labels are NOT shown during recording (just raw text). Font is large enough to read at a glance.
- **After interview**: Formatted Markdown preview rendered in-app. Download button triggers a `Blob` download of the `.md` file.
- **File naming**: `interview-[YYYY-MM-DD]-[company-or-unknown].md` (e.g., `interview-2026-05-14-anthropic.md`)
- **File location**: Downloads to the device's default Downloads folder via browser download prompt.
- **Audio backup** (only if API dropped): `interview-[YYYY-MM-DD]-audio-backup.webm`

### Sample Output Format
```markdown
# Informational Interview — Anthropic
**Date**: May 14, 2026
**Duration**: ~42 minutes

---

## Background & Role

**Me**: Can you tell me a bit about how you got into AI safety research?

**Them**: Sure — I actually started in academia...

## Career Advice

**Them**: The most important thing early on is to ship things. Don't wait until you feel ready.

**Me**: What does "shipping" look like for someone still in school?

...

---

## Key Insights

- Ship projects early — a GitHub repo with real code matters more than grades
- Read the Alignment Forum regularly; it's where the field actually debates
- Cold email works if you reference specific work the person has published

## Action Items

- [ ] Follow up with a thank-you email referencing the point about the Alignment Forum
- [ ] Look into the paper they mentioned on mechanistic interpretability

## Resources Mentioned

- Alignment Forum (alignmentforum.org)
- "Mechanistic Interpretability" research thread at Anthropic
```

---

## 7. Error Handling

| Error | User-Facing Message | Recovery Action | Logged? |
|---|---|---|---|
| No API key set | "Add your OpenAI API key in Settings before recording." | Link to Settings | No |
| Invalid API key | "Your OpenAI API key was rejected. Check it in Settings." | Link to Settings | No |
| Mic permission denied | "Microphone access is required. Please allow it in your browser settings." | Show browser instructions | No |
| WebSocket fails to open | "Couldn't connect to OpenAI. Check your internet and try again." | Retry button | No |
| WebSocket drops mid-interview | "Live transcription paused — audio is still being saved. Attempting to reconnect..." | Auto-retry once after 5s; if fails, keep recording audio only | No |
| Post-processing API fails | "AI processing failed. Your raw transcript has been saved — download it below." | Show raw unformatted transcript + download button | No |
| Post-processing returns invalid JSON | Parse error → fall back to raw transcript | Show raw transcript | No |
| Audio too long for context window | Split transcript into chunks before sending to GPT-4o-mini | Silently chunk, user sees no difference | No |
| No internet during post-processing | "No internet connection. Reconnect and tap 'Process' to finish." | Manual retry button shown | No |
| File download fails | "Download failed. Try again." | Retry button | No |

> **Logging**: No log file. This is a personal tool — errors are surfaced in the UI only. Keep it simple.

---

## 8. UI Components

### 8a. App Shell
- Single-page app (no routing needed in v1)
- Mobile-first, portrait orientation
- Dark background (easy on eyes in a professional setting)
- Minimal chrome — the transcript takes up most of the screen during recording

### 8b. Home Screen
- App title at top
- "New Interview" primary button (large, full-width)
- Past interviews list (if any downloaded — show filename + date) — v2 feature, scaffold the space
- Settings gear icon top-right

### 8c. Pre-Interview Screen
- Optional fields:
  - "Interviewee name" (text input, placeholder: "e.g. Sarah")
  - "Company" (text input, placeholder: "e.g. Anthropic")
- "Start Recording" button (large, red/accent color)
- Back button

### 8d. Recording Screen
- Red pulsing recording indicator + elapsed timer ("Recording — 4:32")
- Scrolling transcript area (takes ~70% of screen)
  - Text appears incrementally as words come in
  - Auto-scrolls to bottom
  - Monospace or clean readable font
- Yellow warning banner (hidden by default, shown if API drops):
  "⚠️ Transcription paused — audio backup active"
- "End Interview" button (bottom, prominent)
- "Cancel" small link (below End button) — discards everything with a confirmation dialog

### 8e. Processing Screen
- Spinner animation
- Text: "Processing your interview..." → cycles through:
  - "Identifying speakers..."
  - "Extracting key insights..."
  - "Formatting transcript..."
- No cancel button (let it finish)

### 8f. Results Screen
- Formatted transcript rendered as HTML from Markdown
- Collapsible "Key Insights" section at bottom
- "Download Transcript (.md)" button
- "Download Audio Backup" button (only shown if audio backup exists)
- "Done" button → returns to Home

### 8g. Settings Screen
- OpenAI API key field (password input, masked by default, eye icon to reveal)
- "Save" button
- "How to get an API key" help link → opens openai.com/api in new tab
- About section: app name, version, GitHub link

### 8h. First-Run Wizard (see Section 9)

---

## 9. First-Run Wizard

Shown only once, on first launch. Detected by checking `localStorage.getItem('apiKey') === null` AND `localStorage.getItem('onboardingComplete') === null`.

### Screen 1: Welcome
```
Welcome to
AI Interview Assistant

Capture informational interviews —
live transcription, speaker labels,
and key insights automatically.

[Get Started →]
```

### Screen 2: API Key Setup
```
You'll need an OpenAI API key.

This key is stored only on your device.
It's never shared with anyone except OpenAI.

[    Enter your OpenAI API key    ] 👁

Each interview costs roughly $0.80
(about 45 minutes of transcription).

[Need a key? → platform.openai.com/api-keys]

[Save and Continue →]
```
- "Save and Continue" is disabled until the field is non-empty
- Validate by making a lightweight test call (`/v1/models`) — if it fails, show: "That key didn't work. Double-check and try again."

### Screen 3: Microphone Permission
```
Allow Microphone Access

The app needs your microphone to
transcribe the conversation.

When your browser asks, tap "Allow."

[Request Microphone Access →]
```
- Tap triggers `navigator.mediaDevices.getUserMedia({ audio: true })`
- If granted → proceed
- If denied → show: "Microphone access is required. You can change this in your browser's site settings." with a "Try Again" button

### Screen 4: Ready
```
You're all set.

Open the app before your next
informational interview and tap
"New Interview" to begin.

[Start Using the App →]
```
- Sets `localStorage.setItem('onboardingComplete', 'true')`

---

## 10. Settings

One page, accessible via gear icon from any screen.

| Setting | Type | Stored In | Notes |
|---|---|---|---|
| OpenAI API key | Password text input | `localStorage` | Masked by default |

**Future settings (v2 scaffolding — don't build yet, just comment placeholders):**
- Transcription language (auto-detect vs. specific)
- Speaker 1 name (default "Me")
- Speaker 2 name (default "Them")
- Post-processing model selection

---

## 11. History / Data

**v1 scope**: The app does NOT store past interviews internally. Each interview produces one downloadable `.md` file. The user manages their own files.

**What lives in localStorage**:
- `apiKey` — the OpenAI API key
- `onboardingComplete` — `'true'` when wizard is done

**What is held in memory during a session**:
- Raw transcript text (accumulates during recording)
- Audio blob chunks (MediaRecorder output, for backup)
- Post-processed output (displayed on Results screen)

**On session end**: Everything in memory is discarded. Nothing is written to disk automatically except the file the user explicitly downloads.

**On uninstall / clear site data**: localStorage is cleared. All in-memory data is gone. Downloaded `.md` files the user saved are unaffected.

**Privacy**: The only data that leaves the device is audio (sent to OpenAI for transcription) and transcript text (sent to OpenAI for post-processing). This is disclosed in the first-run wizard.

---

## 12. Audio / Visual Feedback

| Event | Feedback |
|---|---|
| Recording starts | Red pulsing dot appears + timer starts |
| New transcript text arrives | Text animates in (fade or slide-up) |
| API drops mid-interview | Yellow warning banner slides down |
| API reconnects | Banner slides back up |
| Processing starts | Spinner appears, status text cycles |
| Processing completes | Smooth transition to Results screen |
| File downloaded | Brief green checkmark "Downloaded!" toast |
| Error | Red toast notification at bottom of screen, auto-dismisses after 5s |

**Sound**: No sounds. The app is designed to be used in a quiet professional meeting — no audio feedback.

---

## 13. File Structure

```
AI-informational-interview-AI-assistant/
├── index.html               # Single HTML file — entire app shell
├── manifest.json            # PWA manifest (name, icons, theme color)
├── service-worker.js        # PWA service worker (offline support, caching)
├── css/
│   └── style.css            # All styles — mobile-first, dark theme
├── js/
│   ├── app.js               # Main entry point — screen routing, state management
│   ├── api.js               # All OpenAI API calls (Realtime WS + GPT-4o-mini)
│   ├── audio.js             # MediaRecorder setup, audio chunk collection, backup blob
│   ├── transcript.js        # Transcript accumulation, streaming display logic
│   ├── postprocess.js       # Speaker classification, insights, Markdown formatting
│   ├── storage.js           # localStorage read/write helpers (apiKey, onboarding)
│   ├── download.js          # File download logic (Blob → .md, .webm)
│   └── ui.js                # DOM manipulation helpers, screen transitions, toasts
├── icons/
│   ├── icon-192.png         # PWA icon 192x192
│   └── icon-512.png         # PWA icon 512x512
└── README.md                # Setup instructions, API key warning, usage guide
```

---

## 14. Dependencies

### Runtime (no npm, loaded from CDN if needed)
| Library | Purpose | Version | CDN |
|---|---|---|---|
| `marked.js` | Render Markdown as HTML on Results screen | Latest | jsdelivr.net |

Everything else is vanilla JS using browser-native APIs:
- `WebSocket` — Realtime API connection
- `MediaRecorder` — audio backup recording
- `AudioContext` / `AudioWorklet` — PCM16 conversion for Realtime API
- `localStorage` — API key + onboarding state
- `Blob` + `URL.createObjectURL` — file downloads
- `navigator.mediaDevices.getUserMedia` — mic access

### Dev (optional, no build step required)
| Tool | Purpose |
|---|---|
| Live Server (VS Code ext) | Local dev server with hot reload |
| ngrok | Expose local server to phone for testing (HTTPS required for mic access) |

> ⚠️ **HTTPS required**: The Microphone API and PWA service workers only work on HTTPS or localhost. For testing on your phone, use ngrok or deploy to GitHub Pages.

---

## 15. Build & Distribution

### Local Development
```bash
# No build step needed — just open index.html
# For phone testing, you need HTTPS:
npx ngrok http 5500   # point to your Live Server port
# Open the ngrok URL on your phone
```

### Deployment (GitHub Pages — recommended)
```bash
# In your repo settings → Pages → Source: Deploy from branch → main → / (root)
# Your app will be live at:
# https://[your-github-username].github.io/AI-informational-interview-AI-assistant/
```

### PWA Installation on Phone
1. Open the GitHub Pages URL in Safari (iOS) or Chrome (Android)
2. iOS: tap Share → "Add to Home Screen"
3. Android: tap browser menu → "Add to Home Screen" or "Install App"
4. App icon appears on home screen; opens in standalone mode (no browser chrome)

### Service Worker Caching Strategy
- Cache all app assets on install (app shell caching)
- API calls are NOT cached (they must be live)
- If offline: show cached app shell + message "No internet — API calls require connection"

---

## 16. Installer & Uninstaller

**Install**: Open URL → browser prompts "Add to Home Screen" → tap → done.

**Uninstall**:
- iOS: long-press app icon → Remove App
- Android: long-press app icon → Uninstall

**What gets cleaned up**: Home screen icon, service worker, cached assets.
**What stays behind**: Nothing. localStorage is cleared when the PWA is uninstalled (iOS) or when the user clears site data in browser settings.
**Downloaded .md files**: Unaffected by uninstall — they live in the device's Downloads folder.

---

## 17. Complete UI Copy

### First-Run Wizard

**Screen 1 — Welcome**
- Heading: "Welcome to AI Interview Assistant"
- Body: "Capture informational interviews — live transcription, speaker labels, and key insights automatically."
- Button: "Get Started →"

**Screen 2 — API Key**
- Heading: "Connect to OpenAI"
- Body: "Enter your OpenAI API key. It's stored only on your device and is never shared with anyone except OpenAI."
- Input placeholder: "sk-..."
- Help link: "Need a key? Get one at platform.openai.com"
- Cost note: "Each ~45-minute interview costs roughly $0.80 in API usage."
- Button: "Save and Continue →"
- Error: "That key didn't work. Double-check it and try again."

**Screen 3 — Microphone**
- Heading: "Allow Microphone Access"
- Body: "The app needs your microphone to transcribe the conversation live. When your browser asks, tap Allow."
- Button: "Request Microphone Access →"
- Denied state: "Microphone access was denied. Open your browser's site settings and allow microphone access for this page."
- Denied button: "Try Again"

**Screen 4 — Ready**
- Heading: "You're all set."
- Body: "Open the app before your next informational interview and tap New Interview to begin."
- Button: "Start Using the App →"

### Pre-Interview Screen
- Heading: "New Interview"
- Label 1: "Interviewee Name (optional)"
- Placeholder 1: "e.g. Sarah"
- Label 2: "Company (optional)"
- Placeholder 2: "e.g. Anthropic"
- Button: "Start Recording"
- Cancel: "← Back"

### Recording Screen
- Status: "Recording — 0:00"
- Transcript placeholder (shown before first words): "Transcript will appear here as you speak..."
- Warning banner: "⚠️ Transcription paused — audio backup is active"
- Reconnect banner: "✓ Transcription reconnected"
- End button: "End Interview"
- Cancel link: "Cancel and discard"
- Cancel confirmation: "Discard this recording? This cannot be undone." | "Discard" | "Keep Recording"

### Processing Screen
- Heading: "Processing..."
- Status messages (cycle every 3s):
  - "Identifying speakers..."
  - "Extracting key insights..."
  - "Formatting your transcript..."

### Results Screen
- Heading: "Interview Complete"
- Section: "Transcript"
- Section: "Key Insights"
- Button 1: "Download Transcript (.md)"
- Button 2 (conditional): "Download Audio Backup (.webm)"
- Success toast: "Downloaded!"
- Done button: "Done"

### Settings Screen
- Heading: "Settings"
- Label: "OpenAI API Key"
- Placeholder: "sk-..."
- Help link: "How to get an API key →"
- Save button: "Save"
- Save success toast: "Saved!"
- About: "AI Interview Assistant · MIT License · GitHub →"

### Error Toasts
- No API key: "Add your OpenAI API key in Settings before recording."
- Invalid key: "Your API key was rejected. Check it in Settings."
- No microphone: "Microphone access is required. Allow it in your browser settings."
- Connection failed: "Couldn't connect to OpenAI. Check your internet and try again."
- Post-processing failed: "AI processing failed. Downloading your raw transcript instead."
- No internet (post-processing): "No internet. Reconnect and tap Process to finish."

---

## 18. Recommended Build Order

Build in this order to avoid getting blocked:

1. **Static shell** — `index.html` with all screens stubbed out as hidden `<div>`s. No logic yet. Just get the layout right.
2. **CSS + typography** — Dark theme, mobile layout, font choices. Make it look right on your phone first.
3. **Screen routing** — `app.js`: functions to show/hide screens. Wire up all buttons to navigate between screens.
4. **localStorage helpers** — `storage.js`: `getApiKey()`, `setApiKey()`, `isOnboardingComplete()`, `markOnboardingComplete()`.
5. **First-Run Wizard** — Full wizard flow with API key save + mic permission request.
6. **Settings screen** — API key edit + save.
7. **Microphone access** — `audio.js`: `getUserMedia`, `MediaRecorder` start/stop, chunk collection.
8. **PCM16 conversion** — The hard part. `AudioWorklet` or `ScriptProcessorNode` to convert mic input to PCM16 at 24kHz for the Realtime API. Test this in isolation first.
9. **WebSocket connection** — `api.js`: connect to GPT-Realtime-Whisper, send session config, handle events.
10. **Live transcript display** — `transcript.js`: receive delta events from WS, append to screen, auto-scroll.
11. **API drop handling** — Detect WS close mid-session, show warning banner, attempt one reconnect, continue recording audio.
12. **End Interview flow** — Close WS + stop MediaRecorder on button tap.
13. **Speaker classification** — `postprocess.js`: send raw transcript to GPT-4o-mini, parse JSON response.
14. **Key insights extraction** — Second GPT-4o-mini call, parse JSON.
15. **Markdown formatting** — Third GPT-4o-mini call, receive formatted Markdown string.
16. **Results screen** — Render Markdown with `marked.js`. Show insights list.
17. **File download** — `download.js`: Blob → `.md` download. Audio backup download.
18. **PWA setup** — `manifest.json` + `service-worker.js` + icons. Test "Add to Home Screen."
19. **Error handling pass** — Add all error states from Section 7.
20. **Polish** — Animations, transitions, toast notifications.
21. **Deploy to GitHub Pages** — Test full flow on phone over real internet.

---

## 19. README Checklist

The README must cover:
- [ ] What the app does (one paragraph)
- [ ] ⚠️ "Never commit your API key" warning (prominent, at top)
- [ ] How to get an OpenAI API key (link to platform.openai.com)
- [ ] How to run locally (Live Server + ngrok for phone)
- [ ] How to deploy to GitHub Pages
- [ ] How to install as a PWA on iOS / Android
- [ ] Estimated cost per interview
- [ ] Known limitations (see Section 20)
- [ ] How to add features later (architecture note)

---

## 20. Known Limitations

1. **Speaker diarization is imperfect.** GPT-Realtime-Whisper does not natively separate speakers. The post-processing LLM uses content clues to guess who said what. It will occasionally get it wrong, especially in the first or last few exchanges where there's less context. For a 1-on-1 informational interview with clear Q&A structure, accuracy is generally good.

2. **Mic captures both speakers together.** The phone mic picks up both you and the other person from one input. There's no way to separate them perfectly without two microphones or a service with acoustic diarization.

3. **Requires stable internet.** Both live transcription and post-processing need a live connection. Weak Wi-Fi or cellular in a building can cause the API to drop.

4. **PCM16 conversion is browser-intensive.** Processing audio in real time in the browser can get warm on older phones. If the device struggles, the fallback is to record audio and transcribe after the interview (a simpler architecture to build as a v2 option).

5. **iOS Safari limitations.** Some versions of iOS Safari have quirks with `AudioWorklet` and WebSockets. Test specifically on your device and iOS version before your first real interview.

6. **No transcript history in-app.** Transcripts exist only as downloaded files. The app has no search or browse feature for past interviews.

7. **25MB file limit does not apply here** (that's the Whisper batch API). The Realtime API streams continuously, so interview length is not limited by file size.

8. **Post-processing context window.** A very long interview (90+ minutes) may produce a transcript that exceeds GPT-4o-mini's context window. The app should chunk the transcript if it exceeds ~100,000 characters. Scaffold this in `postprocess.js` even if it doesn't trigger in practice for your use case.

---

## 21. Future Features (Not in v1 — Architecture Notes)

These were intentionally deferred. The architecture is designed to make them easy to add:

- **Live question suggester**: During recording, periodically send the last N words of transcript to GPT-4o-mini and display 1–2 suggested follow-up questions in a small overlay. Hook into `transcript.js`.
- **Thank-you email drafter**: Add a fourth GPT-4o-mini call in `postprocess.js` after the interview. Use the formatted transcript as context. Display in Results screen.
- **In-app transcript history**: Replace the current session-only approach with IndexedDB storage. Each interview stored as a JSON record. Add a list view on Home.
- **Name pre-entry for better classification**: Pass interviewee name to the speaker classification prompt to improve accuracy.
- **Transcript editing**: Allow the user to manually fix speaker labels before downloading.

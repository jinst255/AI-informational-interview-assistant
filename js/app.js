import {
  getApiKey,
  setApiKey,
  hasApiKey,
  isOnboardingComplete,
  markOnboardingComplete,
} from "./storage.js";
import {
  showScreen,
  showToast,
  setBanner,
  setMarkdown,
  fillList,
  formatTimer,
  autoScrollToBottom,
} from "./ui.js";
import { createRealtimeClient, validateApiKey } from "./api.js";
import { startAudioCapture, encodePcm16ToBase64, requestMicrophone } from "./audio.js";
import { resetTranscript, appendTranscript, getTranscript } from "./transcript.js";
import { runPostProcessing } from "./postprocess.js";
import { downloadText, downloadBlob } from "./download.js";

const PROCESSING_MESSAGES = [
  "Identifying speakers...",
  "Extracting key insights...",
  "Formatting your transcript...",
];

const state = {
  currentScreen: "home",
  previousScreen: "home",
  realtimeClient: null,
  audioSession: null,
  recordingStart: null,
  recordingTimer: null,
  processingTimer: null,
  transcriptInitialized: false,
  audioBlob: null,
  hadApiDrop: false,
  reconnectAttempted: false,
  intervieweeName: "",
  intervieweeCompany: "",
  formattedMarkdown: "",
  insights: null,
  recordingDateIso: "",
  isRecording: false,
};

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  bindEvents();
  hydrateSettings();
  bootApp();
  window.addEventListener("offline", () => {
    showToast("No internet - API calls require connection.", "error");
  });
});

function bootApp() {
  if (!hasApiKey() && !isOnboardingComplete()) {
    setScreen("onboarding-welcome");
    return;
  }
  setScreen("home");
}

function bindEvents() {
  document.getElementById("settingsButton").addEventListener("click", toggleSettings);
  document.getElementById("newInterviewButton").addEventListener("click", () =>
    setScreen("pre-interview")
  );
  document.getElementById("preInterviewBack").addEventListener("click", () =>
    setScreen("home")
  );

  document.getElementById("onboardingWelcomeNext").addEventListener("click", () =>
    setScreen("onboarding-api")
  );

  const onboardingApiKey = document.getElementById("onboardingApiKey");
  const onboardingApiSave = document.getElementById("onboardingApiSave");
  onboardingApiKey.addEventListener("input", () => {
    onboardingApiSave.disabled = onboardingApiKey.value.trim().length === 0;
  });
  document.getElementById("onboardingApiToggle").addEventListener("click", () =>
    togglePasswordVisibility(onboardingApiKey, "onboardingApiToggle")
  );
  onboardingApiSave.addEventListener("click", handleOnboardingApiSave);

  document.getElementById("onboardingMicRequest").addEventListener("click", requestMic);
  document.getElementById("onboardingReady").addEventListener("click", () => {
    markOnboardingComplete();
    setScreen("home");
  });

  document.getElementById("startRecordingButton").addEventListener("click", startRecording);
  document.getElementById("endInterviewButton").addEventListener("click", endRecording);
  document.getElementById("cancelRecordingLink").addEventListener("click", cancelRecording);

  document.getElementById("downloadTranscriptButton").addEventListener("click", downloadTranscript);
  document.getElementById("downloadAudioButton").addEventListener("click", downloadAudioBackup);
  document.getElementById("resultsDoneButton").addEventListener("click", () => {
    resetRecordingState();
    setScreen("home");
  });

  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("settingsApiToggle").addEventListener("click", () => {
    const input = document.getElementById("settingsApiKey");
    togglePasswordVisibility(input, "settingsApiToggle");
  });
}

function hydrateSettings() {
  document.getElementById("settingsApiKey").value = getApiKey();
}

function setScreen(name) {
  state.previousScreen = state.currentScreen;
  state.currentScreen = name;
  showScreen(name);
}

async function handleOnboardingApiSave() {
  const apiKeyInput = document.getElementById("onboardingApiKey");
  const errorText = document.getElementById("onboardingApiError");
  const apiKey = apiKeyInput.value.trim();

  errorText.hidden = true;
  if (!apiKey) return;

  const saveButton = document.getElementById("onboardingApiSave");
  saveButton.disabled = true;
  const isValid = await validateApiKey(apiKey).catch(() => false);
  saveButton.disabled = false;
  if (!isValid) {
    errorText.hidden = false;
    return;
  }

  setApiKey(apiKey);
  document.getElementById("settingsApiKey").value = apiKey;
  setScreen("onboarding-mic");
}

async function requestMic() {
  const errorText = document.getElementById("onboardingMicError");
  const micButton = document.getElementById("onboardingMicRequest");
  errorText.hidden = true;

  try {
    const stream = await requestMicrophone();
    stream.getTracks().forEach((track) => track.stop());
    setScreen("onboarding-ready");
  } catch (error) {
    errorText.hidden = false;
    micButton.textContent = "Try Again";
  }
}

function toggleSettings() {
  if (state.currentScreen === "settings") {
    setScreen(state.previousScreen || "home");
    return;
  }
  setScreen("settings");
}

function saveSettings() {
  const apiKey = document.getElementById("settingsApiKey").value.trim();
  setApiKey(apiKey);
  showToast("Saved!", "success");
}

async function startRecording() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast("Add your OpenAI API key in Settings before recording.", "error");
    setScreen("settings");
    return;
  }

  const isValid = await validateApiKey(apiKey).catch(() => false);
  if (!isValid) {
    showToast("Your API key was rejected. Check it in Settings.", "error");
    setScreen("settings");
    return;
  }

  state.intervieweeName = document.getElementById("intervieweeName").value.trim();
  state.intervieweeCompany = document.getElementById("intervieweeCompany").value.trim();
  state.hadApiDrop = false;
  state.reconnectAttempted = false;
  state.isRecording = true;
  resetTranscript();
  resetTranscriptUI();
  setBanner(document.getElementById("recordingBanner"), false);
  setBanner(document.getElementById("reconnectBanner"), false);

  try {
    state.audioSession = await startAudioCapture({
      onPcmData: handlePcmData,
    });
  } catch (error) {
    state.isRecording = false;
    showToast("Microphone access is required. Allow it in your browser settings.", "error");
    return;
  }

  try {
    await connectRealtime(apiKey);
  } catch (error) {
    state.isRecording = false;
    showToast("Couldn't connect to OpenAI. Check your internet and try again.", "error");
    await stopAudioSession();
    return;
  }

  state.recordingStart = Date.now();
  startRecordingTimer();
  setScreen("recording");
}

async function connectRealtime(apiKey) {
  state.realtimeClient = createRealtimeClient({
    apiKey,
    onTranscriptDelta: handleTranscriptDelta,
    onError: () => {
      showToast("Couldn't connect to OpenAI. Check your internet and try again.", "error");
    },
    onClose: handleRealtimeClose,
  });
  await state.realtimeClient.connect();
  setBanner(document.getElementById("recordingBanner"), false);
  const reconnectBanner = document.getElementById("reconnectBanner");
  if (state.hadApiDrop) {
    setBanner(reconnectBanner, true);
    setTimeout(() => setBanner(reconnectBanner, false), 2500);
  }
}

function handleRealtimeClose() {
  if (!state.isRecording) return;
  state.hadApiDrop = true;
  const warningBanner = document.getElementById("recordingBanner");
  setBanner(warningBanner, true, "Warning: Transcription paused - audio backup is active");

  if (state.reconnectAttempted) return;
  state.reconnectAttempted = true;

  setTimeout(async () => {
    try {
      await connectRealtime(getApiKey());
      setBanner(warningBanner, false);
    } catch (error) {
      showToast("Live transcription paused - audio is still being saved.", "error");
    }
  }, 5000);
}

function handlePcmData(pcm16) {
  if (!state.realtimeClient || !state.realtimeClient.isConnected()) return;
  const base64 = encodePcm16ToBase64(pcm16);
  state.realtimeClient.sendAudio(base64);
}

function handleTranscriptDelta(delta) {
  if (!delta) return;
  const transcriptElement = document.getElementById("liveTranscript");
  if (!state.transcriptInitialized) {
    transcriptElement.innerHTML = "";
    state.transcriptInitialized = true;
  }

  appendTranscript(delta);
  const span = document.createElement("span");
  span.textContent = delta;
  transcriptElement.appendChild(span);
  autoScrollToBottom(transcriptElement);
}

async function endRecording() {
  if (state.currentScreen !== "recording") return;
  state.isRecording = false;
  stopRecordingTimer();

  if (state.realtimeClient) {
    state.realtimeClient.commitAudio();
    state.realtimeClient.close();
  }

  state.audioBlob = await stopAudioSession();
  setScreen("processing");
  startProcessingStatus();

  await processInterview();
}

async function cancelRecording() {
  if (!confirm("Discard this recording? This cannot be undone.")) return;
  state.isRecording = false;
  stopRecordingTimer();
  if (state.realtimeClient) {
    state.realtimeClient.close();
  }
  await stopAudioSession();
  resetRecordingState();
  setScreen("home");
}

async function stopAudioSession() {
  if (!state.audioSession) return null;
  const blob = await state.audioSession.stop();
  state.audioSession = null;
  return blob;
}

async function processInterview() {
  const transcript = getTranscript();
  const processingError = () => {
    showToast("AI processing failed. Downloading your raw transcript instead.", "error");
    renderFallback(transcript);
  };

  if (!transcript) {
    processingError();
    stopProcessingStatus();
    setScreen("results");
    return;
  }

  const metadata = buildMetadata();
  try {
    const result = await runPostProcessing(getApiKey(), transcript, metadata);
    state.formattedMarkdown = result.markdown || buildRawMarkdown(transcript, metadata);
    state.insights = result.insights || null;
    renderResults(state.formattedMarkdown, state.insights);
  } catch (error) {
    processingError();
  }

  stopProcessingStatus();
  setScreen("results");
}

function buildMetadata() {
  const date = new Date();
  state.recordingDateIso = date.toISOString().slice(0, 10);
  const durationSeconds = Math.max(0, Math.round((Date.now() - state.recordingStart) / 1000));
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    date: date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    duration: `~${minutes} minutes`,
  };
}

function buildRawMarkdown(transcript, metadata) {
  const label = state.intervieweeCompany || state.intervieweeName || "Interview";
  const title = `Informational Interview - ${label}`;
  return `# ${title}\n**Date**: ${metadata.date}\n**Duration**: ${metadata.duration}\n\n---\n\n${transcript}`;
}

function renderResults(markdown, insights) {
  setMarkdown("resultsMarkdown", markdown);

  if (insights) {
    fillList("insightsList", insights.key_insights || []);
    fillList("actionItemsList", insights.action_items || []);
    fillList("resourcesList", insights.resources_mentioned || []);
  } else {
    fillList("insightsList", []);
    fillList("actionItemsList", []);
    fillList("resourcesList", []);
  }

  const audioButton = document.getElementById("downloadAudioButton");
  audioButton.hidden = !state.hadApiDrop || !state.audioBlob;
}

function renderFallback(transcript) {
  const metadata = buildMetadata();
  state.formattedMarkdown = buildRawMarkdown(transcript, metadata);
  renderResults(state.formattedMarkdown, null);
}

function downloadTranscript() {
  if (!state.formattedMarkdown) return;
  const date = state.recordingDateIso || new Date().toISOString().slice(0, 10);
  const label = slugify(state.intervieweeCompany || state.intervieweeName || "unknown");
  const filename = `interview-${date}-${label}.md`;
  downloadText(filename, state.formattedMarkdown);
  showToast("Downloaded!", "success");
}

function downloadAudioBackup() {
  if (!state.audioBlob) return;
  const date = state.recordingDateIso || new Date().toISOString().slice(0, 10);
  const filename = `interview-${date}-audio-backup.webm`;
  downloadBlob(filename, state.audioBlob);
  showToast("Downloaded!", "success");
}

function resetTranscriptUI() {
  const transcriptElement = document.getElementById("liveTranscript");
  transcriptElement.innerHTML = "<p class=\"placeholder\">Transcript will appear here as you speak...</p>";
  state.transcriptInitialized = false;
}

function startRecordingTimer() {
  const status = document.getElementById("recordingStatus");
  state.recordingTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - state.recordingStart) / 1000);
    status.textContent = `Recording - ${formatTimer(seconds)}`;
  }, 1000);
}

function stopRecordingTimer() {
  if (state.recordingTimer) {
    clearInterval(state.recordingTimer);
    state.recordingTimer = null;
  }
}

function startProcessingStatus() {
  const status = document.getElementById("processingStatus");
  let index = 0;
  status.textContent = PROCESSING_MESSAGES[index];
  state.processingTimer = setInterval(() => {
    index = (index + 1) % PROCESSING_MESSAGES.length;
    status.textContent = PROCESSING_MESSAGES[index];
  }, 3000);
}

function stopProcessingStatus() {
  if (state.processingTimer) {
    clearInterval(state.processingTimer);
    state.processingTimer = null;
  }
}

function resetRecordingState() {
  state.recordingStart = null;
  state.audioBlob = null;
  state.hadApiDrop = false;
  state.reconnectAttempted = false;
  state.formattedMarkdown = "";
  state.insights = null;
  state.recordingDateIso = "";
  state.isRecording = false;
  state.intervieweeName = "";
  state.intervieweeCompany = "";
  const nameInput = document.getElementById("intervieweeName");
  const companyInput = document.getElementById("intervieweeCompany");
  if (nameInput) nameInput.value = "";
  if (companyInput) companyInput.value = "";
  resetTranscript();
  resetTranscriptUI();
}

function togglePasswordVisibility(input, buttonId) {
  const button = document.getElementById(buttonId);
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.textContent = isHidden ? "Hide" : "Show";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
    });
  }
}

import {
  parseOpenAIErrorResponse,
  formatOpenAIErrorMessage,
  formatOpenAIRealtimeError,
} from "./errors.js";

const REALTIME_MODEL = "gpt-realtime-whisper";
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
const REALTIME_CONNECT_TIMEOUT_MS = 10000;

export async function validateApiKey(apiKey) {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorInfo = await parseOpenAIErrorResponse(response, "API key validation failed");
    return { ok: false, message: formatOpenAIErrorMessage(errorInfo) };
  } catch (error) {
    return {
      ok: false,
      message: "Network error while contacting OpenAI. Check your connection.",
    };
  }
}

export async function transcribeAudioFile(apiKey, file) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key");
  }
  if (!file) {
    throw new Error("No audio file provided");
  }

  const formData = new FormData();
  formData.append("model", "gpt-4o-mini-transcribe");
  formData.append("file", file, file.name || "audio.webm");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  let response;

  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenAI transcription timed out. Try again.");
    }
    throw new Error("Network error while contacting OpenAI.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorInfo = await parseOpenAIErrorResponse(response, "Audio transcription failed");
    throw new Error(formatOpenAIErrorMessage(errorInfo));
  }

  const data = await response.json();
  return (data.text || "").trim();
}

export function createRealtimeClient({ apiKey, onTranscriptDelta, onStatus, onError, onClose }) {
  let socket = null;

  function connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(formatOpenAIRealtimeError("Timed out connecting to OpenAI realtime.")));
      }, REALTIME_CONNECT_TIMEOUT_MS);

      socket = new WebSocket(REALTIME_URL, [
        "realtime",
        `openai-insecure-api-key.${apiKey}`,
      ]);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        sendSessionConfig();
        if (onStatus) onStatus("connected");
        resolve();
      };

      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          return;
        }

        if (message.type === "error") {
          if (onError) onError(formatOpenAIRealtimeError(message.error));
          return;
        }

        const isDelta =
          message.type === "conversation.item.input_audio_transcription.delta" ||
          message.type === "response.audio_transcript.delta";
        if (isDelta && onTranscriptDelta) {
          onTranscriptDelta(message.delta || message.text || "");
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(new Error(formatOpenAIRealtimeError("WebSocket connection failed")));
        }
        if (onError) onError(formatOpenAIRealtimeError("WebSocket connection failed"));
      };

      socket.onclose = (event) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          const reason = event?.reason ? ` (${event.reason})` : "";
          reject(
            new Error(formatOpenAIRealtimeError(`WebSocket closed before ready${reason}`))
          );
        }
        if (onClose) onClose(event);
      };
    });
  }

  function sendSessionConfig() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000,
              },
              transcription: {
                model: REALTIME_MODEL,
              },
              turn_detection: null,
            },
          },
        },
      })
    );
  }

  function sendAudio(base64Audio) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      })
    );
  }

  function commitAudio() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  }

  function close() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }

  function isConnected() {
    return socket && socket.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    sendAudio,
    commitAudio,
    close,
    isConnected,
  };
}


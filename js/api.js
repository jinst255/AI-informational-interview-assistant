const REALTIME_MODEL = "gpt-realtime-whisper";
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;

export async function validateApiKey(apiKey) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  return response.ok;
}

export function createRealtimeClient({ apiKey, onTranscriptDelta, onStatus, onError, onClose }) {
  let socket = null;

  function connect() {
    return new Promise((resolve, reject) => {
      socket = new WebSocket(REALTIME_URL, [
        "realtime",
        `openai-insecure-api-key.${apiKey}`,
        "openai-beta.realtime-v1",
      ]);

      socket.onopen = () => {
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
          if (onError) onError(message.error?.message || "Realtime API error");
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
        if (onError) onError("WebSocket connection failed");
      };

      socket.onclose = () => {
        if (onClose) onClose();
      };
    });
  }

  function sendSessionConfig() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          input_audio_transcription: {
            model: REALTIME_MODEL,
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

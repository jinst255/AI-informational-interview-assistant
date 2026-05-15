let rawTranscript = "";

export function resetTranscript() {
  rawTranscript = "";
}

export function appendTranscript(delta) {
  rawTranscript += delta;
  return rawTranscript;
}

export function setTranscript(value) {
  rawTranscript = (value || "").toString();
}

export function getTranscript() {
  return rawTranscript.trim();
}

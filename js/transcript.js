let rawTranscript = "";

export function resetTranscript() {
  rawTranscript = "";
}

export function appendTranscript(delta) {
  rawTranscript += delta;
  return rawTranscript;
}

export function getTranscript() {
  return rawTranscript.trim();
}

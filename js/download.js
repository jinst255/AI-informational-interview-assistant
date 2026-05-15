export function downloadText(filename, text, mimeType = "text/markdown") {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

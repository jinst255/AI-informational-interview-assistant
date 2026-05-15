export function showScreen(name) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((screen) => {
    const isTarget = screen.dataset.screen === name;
    screen.hidden = !isTarget;
  });
  updateHeaderVisibility(name);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function updateHeaderVisibility(screenName) {
  const header = document.getElementById("appHeader");
  const hideOnScreens = [
    "onboarding-welcome",
    "onboarding-api",
    "onboarding-mic",
    "onboarding-ready",
  ];
  header.style.display = hideOnScreens.includes(screenName) ? "none" : "flex";
}

export function showToast(message, type = "info", duration = 5000) {
  const root = document.getElementById("toastRoot");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
}

export function setBanner(element, visible, message) {
  if (!element) return;
  element.hidden = !visible;
  if (message) {
    element.textContent = message;
  }
}

export function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

export function setMarkdown(targetId, markdown) {
  const element = document.getElementById(targetId);
  if (!element) return;
  if (window.marked) {
    element.innerHTML = window.marked.parse(markdown);
  } else {
    element.textContent = markdown;
  }
}

export function fillList(elementId, items = []) {
  const list = document.getElementById(elementId);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No items";
    list.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

export function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function autoScrollToBottom(element) {
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

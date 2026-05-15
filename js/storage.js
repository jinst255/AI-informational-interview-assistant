const API_KEY_STORAGE = "apiKey";
const ONBOARDING_KEY = "onboardingComplete";

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

export function setApiKey(value) {
  const cleaned = value.trim();
  if (!cleaned) {
    localStorage.removeItem(API_KEY_STORAGE);
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, cleaned);
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function isOnboardingComplete() {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

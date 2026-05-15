const UNKNOWN_ERROR_MESSAGE = "OpenAI request failed.";

function inferCause({ status, code, type, message }) {
  if (status === 401 || code === "invalid_api_key" || type === "invalid_api_key") {
    return "invalid API key";
  }
  if (status === 402 || code === "insufficient_quota" || message?.includes("quota")) {
    return "billing issue or no credits";
  }
  if (status === 404 || code === "model_not_found" || message?.includes("model")) {
    return "model not available or access not enabled";
  }
  if (status === 429 || code === "rate_limit_exceeded" || message?.includes("rate limit")) {
    return "rate limit or quota exceeded";
  }
  if (status && status >= 500) {
    return "OpenAI service issue";
  }
  return "";
}

export async function parseOpenAIErrorResponse(response, fallback = UNKNOWN_ERROR_MESSAGE) {
  let message = fallback;
  let code = "";
  let type = "";

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      message = data?.error?.message || message;
      code = data?.error?.code || "";
      type = data?.error?.type || "";
    } else {
      const text = await response.text();
      if (text) message = text;
    }
  } catch (error) {
    // Ignore parse errors and use fallback.
  }

  return {
    status: response.status,
    message,
    code,
    type,
  };
}

export function formatOpenAIErrorMessage(errorInfo, fallback = UNKNOWN_ERROR_MESSAGE) {
  if (!errorInfo) return fallback;
  const status = errorInfo.status;
  const message = errorInfo.message || fallback;
  const cause = inferCause({
    status,
    code: errorInfo.code || "",
    type: errorInfo.type || "",
    message: (errorInfo.message || "").toLowerCase(),
  });
  const causeText = cause ? ` Likely cause: ${cause}.` : "";
  const statusText = status ? ` (HTTP ${status})` : "";
  return `${message}${causeText}${statusText}`;
}

export function formatOpenAIRealtimeError(error) {
  if (!error) {
    return "OpenAI realtime connection error.";
  }
  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    const cause = inferCause({ message: normalized });
    return cause ? `${error} Likely cause: ${cause}.` : error;
  }
  const message = error?.message || UNKNOWN_ERROR_MESSAGE;
  const info = {
    status: error?.status,
    message,
    code: error?.code || "",
    type: error?.type || "",
  };
  return formatOpenAIErrorMessage(info, UNKNOWN_ERROR_MESSAGE);
}

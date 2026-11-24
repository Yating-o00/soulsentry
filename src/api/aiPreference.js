const KEY = "soulsentry_chat_ai_provider";
export function getChatAiProvider() {
  try {
    const value = window.localStorage.getItem(KEY);
    return ["kimi", "deepseek"].includes(value) ? value : "";
  } catch { return ""; }
}
export function setChatAiProvider(value) {
  if (value) window.localStorage.setItem(KEY, value);
  else window.localStorage.removeItem(KEY);
}

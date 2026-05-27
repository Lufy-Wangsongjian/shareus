export type ChatTheme = "dark" | "light";

const CHAT_THEME_KEY = "shareus:chat-theme";

export function loadChatTheme(): ChatTheme {
  if (typeof window === "undefined") {
    return "dark";
  }
  const saved = localStorage.getItem(CHAT_THEME_KEY);
  return saved === "light" ? "light" : "dark";
}

export function saveChatTheme(theme: ChatTheme): void {
  localStorage.setItem(CHAT_THEME_KEY, theme);
}

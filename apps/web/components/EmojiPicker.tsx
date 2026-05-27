"use client";

import { CHAT_EMOJIS, QUICK_SEND_EMOJIS } from "../lib/chatEmojis";
import type { ChatTheme } from "../lib/chatTheme";

export function EmojiPicker({
  open,
  onClose,
  onInsert,
  onSend,
  theme = "dark"
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (emoji: string) => void;
  onSend: (emoji: string) => void;
  theme?: ChatTheme;
}) {
  if (!open) {
    return null;
  }

  const isDark = theme === "dark";
  const panelClass = isDark
    ? "border-slate-700 bg-[#1c1c1c] shadow-black/40"
    : "border-[#d9d9d9] bg-white";
  const hintClass = isDark ? "text-slate-500" : "text-[#999]";
  const dividerClass = isDark ? "border-slate-700" : "border-[#ececec]";
  const itemHoverClass = isDark ? "hover:bg-[#2a2a2a]" : "hover:bg-[#f0f0f0]";

  return (
    <>
      <button
        type="button"
        aria-label="关闭表情面板"
        className="fixed inset-0 z-[9990] cursor-default bg-transparent"
        onClick={onClose}
      />
      <div className={`absolute bottom-full left-0 z-[9991] mb-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border p-2 shadow-lg ${panelClass}`}>
        <div className={`mb-2 border-b pb-2 ${dividerClass}`}>
          <p className={`mb-1 px-1 text-[11px] ${hintClass}`}>点击发送</p>
          <div className="grid grid-cols-8 gap-0.5">
            {QUICK_SEND_EMOJIS.map((emoji) => (
              <button
                key={`quick-${emoji}`}
                type="button"
                className={`flex h-8 items-center justify-center rounded text-xl ${itemHoverClass}`}
                onClick={() => {
                  onSend(emoji);
                  onClose();
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <p className={`mb-1 px-1 text-[11px] ${hintClass}`}>点击插入输入框</p>
        <div className="grid max-h-36 grid-cols-8 gap-0.5 overflow-y-auto">
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`flex h-8 items-center justify-center rounded text-xl ${itemHoverClass}`}
              onClick={() => onInsert(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

"use client";

type NoticePosition = "fixed" | "absolute";

export function ChatFloatingNotice({
  visible,
  count,
  preview,
  onOpen,
  position = "absolute"
}: {
  visible: boolean;
  count: number;
  preview: string;
  onOpen: () => void;
  position?: NoticePosition;
}) {
  if (!visible) {
    return null;
  }

  const positionClass = position === "fixed"
    ? "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[9999]"
    : "absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[9999]";
  const baseClass = `${positionClass} max-w-[min(18rem,calc(100vw-2rem))] shadow-2xl backdrop-blur-sm transition hover:bg-[#1a1a1a]`;

  if (count <= 0) {
    return (
      <button
        type="button"
        aria-label="展开聊天"
        className={`${baseClass} flex h-12 w-12 max-w-none items-center justify-center rounded-full border border-[#07c160]/40 bg-[#111]/90 text-xl`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        💬
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${baseClass} rounded-xl border border-[#07c160]/40 bg-[#111]/90 px-4 py-3 text-left`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-[#95ec69]">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#07c160] px-1.5 text-xs text-white">
          {count > 99 ? "99+" : count}
        </span>
        新消息
      </div>
      <p className="mt-1 truncate text-sm text-white/90">{preview}</p>
      <p className="mt-1 text-xs text-white/50">点击展开聊天</p>
    </button>
  );
}

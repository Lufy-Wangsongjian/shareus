"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { chatImageUrl, uploadChatImage } from "../lib/chatImage";
import { compressImageBlob } from "../lib/compressImage";

type ChatMessageType = "text" | "image";

interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  sentAt: string;
  isSelf: boolean;
  type?: ChatMessageType;
  imageObjectPath?: string;
}

function avatarColor(name: string): string {
  const colors = ["#576B95", "#10AEFF", "#FA5151", "#FFC300", "#07C160", "#6467F0"];
  let hash = 0;
  for (const char of name) {
    hash = (hash + char.charCodeAt(0)) % colors.length;
  }
  return colors[hash]!;
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-medium text-white"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {initial}
    </div>
  );
}

function messagePreview(message: ChatMessage): string {
  if (message.type === "image") {
    return message.message.trim() || "[图片]";
  }
  return message.message;
}

export function ChatPanel({
  roomId,
  socket,
  nickname,
  roomPassword,
  collapsed,
  onCollapsedChange,
  onIncomingMessage,
  className = ""
}: {
  roomId: string;
  socket: Socket | null;
  nickname: string;
  roomPassword: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onIncomingMessage: (preview: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<Socket | null>(socket);
  const nicknameRef = useRef(nickname);
  const collapsedRef = useRef(collapsed);

  socketRef.current = socket;
  nicknameRef.current = nickname;
  collapsedRef.current = collapsed;

  function appendMessage(payload: {
    id: string;
    nickname: string;
    message: string;
    sentAt: string;
    socketId?: string;
    type?: ChatMessageType;
    imageObjectPath?: string;
  }) {
    const currentSocketId = socketRef.current?.id;
    const isSelf = payload.socketId === currentSocketId
      || payload.nickname === nicknameRef.current;

    const nextMessage: ChatMessage = {
      id: payload.id,
      nickname: payload.nickname,
      message: payload.message,
      sentAt: payload.sentAt,
      isSelf,
      type: payload.type ?? "text",
      imageObjectPath: payload.imageObjectPath
    };

    setMessages((current) => {
      if (current.some((message) => message.id === payload.id)) {
        return current;
      }
      return [...current, nextMessage];
    });

    if (!isSelf && collapsedRef.current) {
      onIncomingMessage(messagePreview(nextMessage));
    }
  }

  useEffect(() => {
    if (!socket) return;

    function onMessage(payload: {
      id: string;
      nickname: string;
      message: string;
      sentAt: string;
      socketId: string;
      type?: ChatMessageType;
      imageObjectPath?: string;
    }) {
      appendMessage(payload);
    }

    function onHistory(payload: {
      roomId: string;
      messages: Array<{
        id: string;
        nickname: string;
        message: string;
        sentAt: string;
        type?: ChatMessageType;
        imageObjectPath?: string;
      }>;
    }) {
      if (payload.roomId !== roomId) return;
      setMessages(payload.messages.map((message) => ({
        ...message,
        type: message.type ?? "text",
        isSelf: message.nickname === nicknameRef.current
      })));
    }

    socket.on("chat:message", onMessage);
    socket.on("chat:history", onHistory);
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:history", onHistory);
    };
  }, [socket, roomId, onIncomingMessage]);

  useEffect(() => {
    if (collapsed) {
      return;
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, collapsed]);

  function sendText() {
    const text = draft.trim();
    if (!text || !socket) return;
    socket.emit("chat:message", { roomId, type: "text", message: text });
    setDraft("");
  }

  async function sendImageBlob(blob: Blob) {
    if (!socket || uploading) return;

    setUploading(true);
    try {
      const compressed = await compressImageBlob(blob);
      const { imageObjectPath } = await uploadChatImage(roomId, roomPassword, compressed);
      const caption = draft.trim();
      socket.emit("chat:message", {
        roomId,
        type: "image",
        imageObjectPath,
        message: caption || undefined
      });
      setDraft("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片发送失败");
    } finally {
      setUploading(false);
    }
  }

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void sendImageBlob(file);
  }

  function onPaste(event: React.ClipboardEvent) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (file) {
      void sendImageBlob(file);
    }
  }

  function formatTime(sentAt: string) {
    return new Date(sentAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  if (collapsed) {
    return null;
  }

  return (
    <>
      <aside className={`flex flex-col overflow-hidden rounded-md border border-[#d9d9d9] bg-[#ededed] ${className}`}>
        <div className="flex items-center justify-between border-b border-[#d9d9d9] bg-[#f7f7f7] px-3 py-2.5">
          <span className="text-sm font-medium text-[#111]">聊天</span>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-[#666] hover:bg-[#ececec] hover:text-[#111]"
            onClick={() => onCollapsedChange(true)}
          >
            收起
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#888]">还没有消息，打个招呼吧</p>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-2.5 ${message.isSelf ? "flex-row-reverse" : "flex-row"}`}
            >
              <Avatar name={message.nickname} />

              <div className={`flex max-w-[72%] flex-col ${message.isSelf ? "items-end" : "items-start"}`}>
                {!message.isSelf ? (
                  <span className="mb-1 px-1 text-xs text-[#888]">{message.nickname}</span>
                ) : null}

                <div
                  className={`relative break-words rounded-md shadow-sm ${
                    message.type === "image"
                      ? "overflow-hidden bg-white p-1"
                      : message.isSelf
                        ? "bg-[#95ec69] px-3 py-2 text-[15px] leading-relaxed text-[#111] after:absolute after:top-2 after:-right-1.5 after:border-y-[6px] after:border-l-[6px] after:border-y-transparent after:border-l-[#95ec69] after:content-['']"
                        : "bg-white px-3 py-2 text-[15px] leading-relaxed text-[#111] after:absolute after:top-2 after:-left-1.5 after:border-y-[6px] after:border-r-[6px] after:border-y-transparent after:border-r-white after:content-['']"
                  }`}
                >
                  {message.type === "image" && message.imageObjectPath ? (
                    <button
                      type="button"
                      className="block"
                      onClick={() => setPreviewImage(chatImageUrl(roomId, message.imageObjectPath!))}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={chatImageUrl(roomId, message.imageObjectPath)}
                        alt={message.message || "聊天图片"}
                        className="max-h-48 max-w-full rounded object-contain"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    message.message
                  )}
                  {message.type === "image" && message.message ? (
                    <p className="px-2 py-1 text-sm text-[#333]">{message.message}</p>
                  ) : null}
                </div>

                <span className="mt-1 px-1 text-[11px] text-[#b2b2b2]">{formatTime(message.sentAt)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#d9d9d9] bg-[#f7f7f7] p-3">
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
            />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d9d9d9] bg-white text-xl leading-none text-[#555] hover:border-[#07c160] disabled:opacity-40"
              disabled={uploading}
              aria-label="发送图片"
              title="发送图片"
              onClick={() => fileInputRef.current?.click()}
            >
              +
            </button>
            <input
              className="min-w-0 flex-1 rounded-md border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm text-[#111] outline-none focus:border-[#07c160]"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={onPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendText();
                }
              }}
              placeholder={uploading ? "图片上传中…" : `Enter 发送，可粘贴截图`}
              disabled={uploading}
            />
            <button
              className="rounded-md bg-[#07c160] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              disabled={!draft.trim() || uploading}
              onClick={sendText}
            >
              发送
            </button>
          </div>
        </div>
      </aside>

      {previewImage ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="预览"
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

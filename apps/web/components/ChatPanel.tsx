"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export function ChatPanel({ roomId, socket }: { roomId: string; socket: Socket | null }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    function onMessage(payload: { message: string }) {
      setMessages((current) => [...current, payload.message]);
    }

    socket.on("chat:message", onMessage);
    return () => {
      socket.off("chat:message", onMessage);
    };
  }, [socket]);

  function send() {
    if (!draft.trim()) return;
    socket?.emit("chat:message", { roomId, message: draft.trim() });
    setMessages((current) => [...current, `我：${draft.trim()}`]);
    setDraft("");
  }

  return (
    <aside className="flex min-h-64 flex-col rounded-md border border-slate-800 p-3">
      <div className="flex-1 space-y-2 text-sm">
        {messages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="rounded-md bg-white px-3 py-2 text-slate-950" onClick={send}>发送</button>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChatPanel } from "../../../components/ChatPanel";
import { HlsPlayer } from "../../../components/HlsPlayer";
import { RoomControls } from "../../../components/RoomControls";
import { joinRoom } from "../../../lib/apiClient";
import { createRoomSocket } from "../../../lib/socketClient";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const [password, setPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState("等待加入");
  const playlistUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/api/rooms/${params.roomId}/playlist.m3u8`;

  useEffect(() => () => {
    socket?.disconnect();
  }, [socket]);

  async function submitJoin() {
    await joinRoom(params.roomId, password);
    const nextSocket = createRoomSocket(params.roomId);
    setSocket(nextSocket);
    setJoined(true);
    setStatus("已同步");
  }

  if (!joined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <h1 className="text-2xl font-semibold">加入房间</h1>
        <input className="mt-6 rounded-md border border-slate-700 bg-slate-900 px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="房间密码" />
        <button className="mt-4 rounded-md bg-white px-4 py-2 text-slate-950" onClick={submitJoin}>进入</button>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <HlsPlayer src={playlistUrl} />
        <RoomControls status={status} />
      </section>
      <ChatPanel roomId={params.roomId} socket={socket} />
    </main>
  );
}

"use client";

import { useState } from "react";
import { AdminLogin } from "../../components/AdminLogin";
import { RoomManager } from "../../components/RoomManager";
import { VideoLibrary } from "../../components/VideoLibrary";

type AdminTab = "videos" | "rooms";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("videos");

  if (!token) {
    return (
      <main className="min-h-screen px-4 py-8">
        <AdminLogin onToken={setToken} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto mb-6 flex w-full max-w-5xl gap-2">
        <button
          type="button"
          className={`rounded-md px-4 py-2 text-sm ${
            tab === "videos" ? "bg-white text-slate-950" : "border border-slate-700 text-slate-300"
          }`}
          onClick={() => setTab("videos")}
        >
          片库
        </button>
        <button
          type="button"
          className={`rounded-md px-4 py-2 text-sm ${
            tab === "rooms" ? "bg-white text-slate-950" : "border border-slate-700 text-slate-300"
          }`}
          onClick={() => setTab("rooms")}
        >
          房间
        </button>
      </div>
      {tab === "videos" ? <VideoLibrary token={token} /> : <RoomManager token={token} />}
    </main>
  );
}

"use client";

import { calculateExpectedPosition } from "@shareus/shared";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { formatPlaybackTime } from "../lib/formatTime";
import type { SyncLogEntry } from "../lib/syncLog";
import type { PeerProgressView, WatchMode } from "../lib/watchMode";

function livePosition(progress: PeerProgressView): number {
  return calculateExpectedPosition({
    isPlaying: progress.isPlaying,
    positionSec: progress.positionSec,
    updatedAtMs: new Date(progress.updatedAt).getTime(),
    nowMs: Date.now()
  });
}

function ProgressChip({
  label,
  progress,
  highlight
}: {
  label: string;
  progress: PeerProgressView;
  highlight?: boolean;
}) {
  const [position, setPosition] = useState(() => livePosition(progress));

  useEffect(() => {
    setPosition(livePosition(progress));
    if (!progress.isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setPosition(livePosition(progress));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [progress.isPlaying, progress.positionSec, progress.updatedAt]);

  const icon = progress.isBuffering ? "…" : progress.isPlaying ? "▶" : "⏸";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
        highlight ? "bg-sky-900/60 text-sky-100" : "bg-slate-800/80 text-slate-300"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{formatPlaybackTime(position)}</span>
      <span className="opacity-70">{icon}</span>
    </span>
  );
}

function modeHint(
  watchMode: WatchMode,
  hostNickname: string | null,
  isHost: boolean
): string {
  if (watchMode === "free") {
    return "各看各的";
  }
  if (!hostNickname) {
    return "同步观影";
  }
  return isHost ? "你是主控" : `跟随 ${hostNickname}`;
}

export function RoomControls({
  roomId,
  socket,
  status,
  syncEvents,
  hostNickname,
  isHost,
  watchMode,
  onWatchModeChange,
  localProgress,
  peerProgresses
}: {
  roomId: string;
  socket: Socket | null;
  status: string;
  syncEvents: SyncLogEntry[];
  hostNickname: string | null;
  isHost: boolean;
  watchMode: WatchMode;
  onWatchModeChange: (mode: WatchMode) => void;
  localProgress: PeerProgressView | null;
  peerProgresses: PeerProgressView[];
}) {
  const [logOpen, setLogOpen] = useState(false);

  function switchMode(mode: WatchMode) {
    if (mode === watchMode) {
      return;
    }
    socket?.emit("room:watch-mode", { roomId, mode });
    onWatchModeChange(mode);
  }

  const latestLog = syncEvents.at(-1);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 text-[11px] leading-tight text-slate-300">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5">
        <div className="inline-flex shrink-0 rounded border border-slate-700 p-px">
          <button
            type="button"
            className={`rounded-sm px-2 py-0.5 transition ${
              watchMode === "sync" ? "bg-white text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => switchMode("sync")}
          >
            同步
          </button>
          <button
            type="button"
            className={`rounded-sm px-2 py-0.5 transition ${
              watchMode === "free" ? "bg-white text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => switchMode("free")}
          >
            自由
          </button>
        </div>
        <span className="truncate text-slate-400">{modeHint(watchMode, hostNickname, isHost)}</span>
        <span className="hidden truncate text-slate-500 sm:inline">·</span>
        <span className="hidden truncate text-slate-500 sm:inline">{status}</span>
      </div>

      {watchMode === "free" ? (
        <div className="flex flex-wrap gap-1 border-t border-slate-800 px-2 py-1.5">
          {localProgress ? (
            <ProgressChip label="我" progress={localProgress} highlight />
          ) : null}
          {peerProgresses.map((peer) => (
            <ProgressChip key={peer.socketId} label={peer.nickname} progress={peer} />
          ))}
          {!localProgress && peerProgresses.length === 0 ? (
            <span className="text-slate-500">等待进度…</span>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-slate-800">
        <button
          type="button"
          className="flex w-full items-center justify-between px-2 py-1 text-left text-slate-500 hover:text-slate-300"
          onClick={() => setLogOpen((open) => !open)}
        >
          <span>{watchMode === "free" ? "观影日志" : "同步日志"}</span>
          <span className="text-slate-600">
            {syncEvents.length > 0 ? `${syncEvents.length} 条` : "空"}
            {" "}
            {logOpen ? "▾" : "▸"}
          </span>
        </button>
        {logOpen ? (
          <div className="max-h-24 space-y-0.5 overflow-y-auto border-t border-slate-800/50 px-2 py-1">
            {syncEvents.length === 0 ? (
              <p className="text-slate-600">暂无记录</p>
            ) : (
              syncEvents
                .slice()
                .reverse()
                .map((entry) => (
                  <div key={entry.id} className="text-slate-400">
                    <span className="text-slate-600">{entry.time}</span>
                    {" "}
                    {entry.message}
                  </div>
                ))
            )}
          </div>
        ) : latestLog ? (
          <div className="truncate border-t border-slate-800/50 px-2 py-1 text-slate-500">
            <span className="text-slate-600">{latestLog.time}</span>
            {" "}
            {latestLog.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

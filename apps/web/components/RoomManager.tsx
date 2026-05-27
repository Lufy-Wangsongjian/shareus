"use client";

import { useEffect, useState } from "react";
import {
  deleteAdminRoom,
  getAdminRoom,
  listAdminRooms,
  type AdminRoomDetail,
  type AdminRoomSummary
} from "../lib/apiClient";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPlaybackTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function roomLink(roomId: string): string {
  if (typeof window === "undefined") {
    return `/room/${roomId}`;
  }
  return `${window.location.origin}/room/${roomId}`;
}

export function RoomManager({ token }: { token: string }) {
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<AdminRoomDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshRooms() {
    setError(null);
    try {
      const nextRooms = await listAdminRooms(token);
      setRooms(nextRooms);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载房间失败");
    }
  }

  useEffect(() => {
    void refreshRooms();
  }, [token]);

  async function openRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setLoadingDetail(true);
    setError(null);
    try {
      const detail = await getAdminRoom(token, roomId);
      setSelectedRoom(detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载房间详情失败");
      setSelectedRoom(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function removeRoom(roomId: string) {
    if (!window.confirm(`确定删除房间 ${roomId}？此操作不可恢复。`)) {
      return;
    }

    setError(null);
    try {
      await deleteAdminRoom(token, roomId);
      if (selectedRoomId === roomId) {
        setSelectedRoomId(null);
        setSelectedRoom(null);
      }
      setNotice(`已删除房间 ${roomId}`);
      await refreshRooms();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除房间失败");
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">房间管理</h1>
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 py-2 text-sm"
            onClick={() => void refreshRooms()}
          >
            刷新
          </button>
        </div>
        {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="mt-6 grid gap-3">
        {rooms.length === 0 ? (
          <p className="rounded-md border border-slate-800 p-4 text-sm text-slate-400">暂无房间</p>
        ) : (
          rooms.map((room) => (
            <article className="rounded-md border border-slate-800 p-4" key={room.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-medium">{room.videoTitle}</h2>
                  <p className="truncate text-sm text-slate-400">{room.id}</p>
                  <p className="text-sm text-slate-400">
                    创建于 {formatDateTime(room.createdAt)}
                    {" · "}
                    {room.status === "open" ? "开放中" : "已关闭"}
                  </p>
                  {room.playbackState ? (
                    <p className="text-sm text-slate-500">
                      最近进度 {formatPlaybackTime(room.playbackState.positionSec)}
                      {" · "}
                      {room.playbackState.isPlaying ? "播放中" : "已暂停"}
                      {" · "}
                      {room.playbackState.updatedBy}
                    </p>
                  ) : null}
                  {room.latestLog ? (
                    <p className="text-sm text-amber-200/80">
                      最新日志：{room.latestLog.message}
                    </p>
                  ) : null}
                  <a
                    className="inline-block text-sm text-sky-300 hover:text-sky-200"
                    href={roomLink(room.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开房间链接
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-3 py-2 text-sm"
                    onClick={() => void openRoom(room.id)}
                  >
                    查看日志
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30"
                    onClick={() => void removeRoom(room.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {selectedRoomId ? (
        <div className="mt-6 rounded-md border border-amber-900/40 bg-amber-950/20">
          <div className="flex items-center justify-between border-b border-amber-900/30 px-4 py-3">
            <div>
              <h3 className="font-medium text-amber-100">观看日志</h3>
              <p className="text-xs text-amber-200/60">{selectedRoomId}</p>
            </div>
            <button
              type="button"
              className="text-xs text-amber-200/70 hover:text-amber-100"
              onClick={() => {
                setSelectedRoomId(null);
                setSelectedRoom(null);
              }}
            >
              关闭
            </button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto px-4 py-3">
            {loadingDetail ? (
              <p className="text-sm text-amber-200/60">加载中…</p>
            ) : selectedRoom?.watchLogs.length ? (
              selectedRoom.watchLogs.map((entry) => (
                <div key={entry.id} className="text-sm leading-relaxed text-amber-100/90">
                  <span className="text-amber-200/50">{formatDateTime(entry.createdAt)}</span>
                  {entry.nickname ? (
                    <>
                      {" · "}
                      <span className="text-amber-200/70">{entry.nickname}</span>
                    </>
                  ) : null}
                  {" · "}
                  {entry.message}
                </div>
              ))
            ) : (
              <p className="text-sm text-amber-200/60">暂无观看日志</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

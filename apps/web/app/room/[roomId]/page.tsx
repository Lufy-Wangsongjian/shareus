"use client";

import type { PlaybackState } from "@shareus/shared";
import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChatFloatingNotice } from "../../../components/ChatFloatingNotice";
import { ChatPanel } from "../../../components/ChatPanel";
import { RoomControls } from "../../../components/RoomControls";
import { SyncedHlsPlayer } from "../../../components/SyncedHlsPlayer";
import { joinRoom } from "../../../lib/apiClient";
import { createRoomSocket } from "../../../lib/socketClient";
import { createSyncLogEntry, type SyncLogEntry } from "../../../lib/syncLog";
import type { PeerProgressView, WatchMode } from "../../../lib/watchMode";

const NICKNAME_KEY = "shareus:nickname";
const DEFAULT_NICKNAME = "Alice";

function unlockPasswordInput(input: HTMLInputElement) {
  if (input.readOnly) {
    input.readOnly = false;
  }
}
const ROOM_PASSWORD_KEY = "shareus:room-password";

interface JoinRoomResponse {
  roomId: string;
  videoId: string;
  playbackState: PlaybackState | null;
}

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const [nickname, setNickname] = useState(DEFAULT_NICKNAME);
  const [password, setPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [initialPlaybackState, setInitialPlaybackState] = useState<PlaybackState | null>(null);
  const [status, setStatus] = useState("等待加入");
  const [syncEvents, setSyncEvents] = useState<SyncLogEntry[]>([]);
  const [hostNickname, setHostNickname] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [watchMode, setWatchMode] = useState<WatchMode>("free");
  const [localProgress, setLocalProgress] = useState<PeerProgressView | null>(null);
  const [peerProgresses, setPeerProgresses] = useState<PeerProgressView[]>([]);
  const [roomPassword, setRoomPassword] = useState("");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatPreview, setChatPreview] = useState("");
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const openChat = useCallback(() => {
    setChatCollapsed(false);
    setChatUnread(0);
    setChatPreview("");
  }, []);

  const onIncomingChatMessage = useCallback((preview: string) => {
    setChatUnread((count) => count + 1);
    setChatPreview(preview);
  }, []);

  const playlistUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/api/rooms/${params.roomId}/playlist.m3u8`;

  const appendSyncEvent = useCallback((message: string) => {
    setSyncEvents((current) => [...current, createSyncLogEntry(message)].slice(-100));
    socket?.emit("watch:log", { roomId: params.roomId, message });
  }, [socket, params.roomId]);

  useEffect(() => {
    const saved = localStorage.getItem(NICKNAME_KEY) ?? sessionStorage.getItem(NICKNAME_KEY);
    if (saved?.trim()) {
      setNickname(saved.trim());
    }
  }, []);

  useEffect(() => () => {
    socket?.disconnect();
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function onWatchMode(payload: {
      roomId: string;
      mode: WatchMode;
      changedBy: string | null;
    }) {
      if (payload.roomId !== params.roomId) {
        return;
      }
      setWatchMode(payload.mode);
      if (payload.changedBy) {
        appendSyncEvent(
          payload.mode === "free"
            ? `${payload.changedBy} 切换为各看各的`
            : `${payload.changedBy} 切换为同步观影`
        );
      }
    }

    function onPeerProgress(progress: PeerProgressView) {
      setPeerProgresses((current) => {
        const next = current.filter((entry) => entry.socketId !== progress.socketId);
        return [...next, progress];
      });
    }

    function onPeerSnapshot(payload: { roomId: string; peers: PeerProgressView[] }) {
      if (payload.roomId !== params.roomId) {
        return;
      }
      setPeerProgresses(payload.peers);
    }

    function onPeerLeft(payload: { roomId: string; socketId: string; nickname: string }) {
      if (payload.roomId !== params.roomId) {
        return;
      }
      setPeerProgresses((current) => current.filter((entry) => entry.socketId !== payload.socketId));
      appendSyncEvent(`${payload.nickname} 离开了房间`);
    }

    socket.on("room:watch-mode", onWatchMode);
    socket.on("playback:peer-progress", onPeerProgress);
    socket.on("playback:peer-snapshot", onPeerSnapshot);
    socket.on("playback:peer-left", onPeerLeft);

    return () => {
      socket.off("room:watch-mode", onWatchMode);
      socket.off("playback:peer-progress", onPeerProgress);
      socket.off("playback:peer-snapshot", onPeerSnapshot);
      socket.off("playback:peer-left", onPeerLeft);
    };
  }, [socket, params.roomId, appendSyncEvent]);

  async function submitJoin() {
    const trimmedNickname = nickname.trim();
    const trimmedPassword = password.trim();
    if (!trimmedNickname) {
      setJoinError("请填写昵称");
      return;
    }
    if (!trimmedPassword) {
      setJoinError("请填写房间密码");
      return;
    }

    try {
      setJoinError(null);
      const room = await joinRoom(params.roomId, trimmedPassword) as JoinRoomResponse;
      localStorage.setItem(NICKNAME_KEY, trimmedNickname);
      sessionStorage.setItem(`${ROOM_PASSWORD_KEY}:${params.roomId}`, trimmedPassword);
      setRoomPassword(trimmedPassword);
      setVideoId(room.videoId);
      setInitialPlaybackState(room.playbackState);
      setSyncEvents([]);
      setWatchMode("free");
      setLocalProgress(null);
      setPeerProgresses([]);
      setChatCollapsed(false);
      setChatUnread(0);
      setChatPreview("");
      const nextSocket = createRoomSocket(params.roomId, trimmedNickname);
      setSocket(nextSocket);
      setJoined(true);
      setStatus(`已加入 · ${trimmedNickname}`);
    } catch {
      setJoinError("加入失败，请检查房间密码");
    }
  }

  if (!joined || !videoId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center overflow-x-hidden px-4">
        <h1 className="text-2xl font-semibold">加入房间</h1>
        <input
          className="mt-6 w-full max-w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-base"
          type="text"
          name={`shareus-nickname-${params.roomId}`}
          autoComplete="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="昵称（必填）"
          maxLength={20}
        />
        <input
          className="mt-3 w-full max-w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-base"
          type="password"
          name={`shareus-room-${params.roomId}`}
          autoComplete="new-password"
          readOnly
          value={password}
          onTouchStart={(event) => unlockPasswordInput(event.currentTarget)}
          onPointerDown={(event) => unlockPasswordInput(event.currentTarget)}
          onFocus={(event) => unlockPasswordInput(event.currentTarget)}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="房间密码"
        />
        {joinError ? <p className="mt-3 text-sm text-red-300">{joinError}</p> : null}
        <button
          className="mt-4 rounded-md bg-white px-4 py-2 text-slate-950 disabled:opacity-40"
          disabled={!nickname.trim() || !password.trim()}
          onClick={submitJoin}
        >
          进入
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] w-full max-w-[100vw] flex-col gap-2 overflow-x-hidden overflow-y-hidden p-2 lg:grid lg:grid-cols-[1fr_280px] lg:grid-rows-1 lg:gap-3 lg:p-3">
      {chatCollapsed && !isPlayerFullscreen ? (
        <ChatFloatingNotice
          visible
          position="fixed"
          count={chatUnread}
          preview={chatPreview}
          onOpen={openChat}
        />
      ) : null}
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1">
          <SyncedHlsPlayer
            src={playlistUrl}
            roomId={params.roomId}
            videoId={videoId}
            nickname={nickname.trim()}
            socket={socket}
            watchMode={watchMode}
            initialPlaybackState={initialPlaybackState}
            onSyncEvent={appendSyncEvent}
            onHostChange={({ hostNickname: nextHost, isHost: nextIsHost }) => {
              setHostNickname(nextHost);
              setIsHost(nextIsHost);
            }}
            onLocalProgress={setLocalProgress}
            onFullscreenChange={setIsPlayerFullscreen}
            overlay={
              chatCollapsed && isPlayerFullscreen ? (
                <ChatFloatingNotice
                  visible
                  position="absolute"
                  count={chatUnread}
                  preview={chatPreview}
                  onOpen={openChat}
                />
              ) : null
            }
          />
        </div>
        <div className="mt-2 shrink-0 lg:hidden">
          <RoomControls
            roomId={params.roomId}
            socket={socket}
            nickname={nickname.trim()}
            status={status}
            syncEvents={syncEvents}
            hostNickname={hostNickname}
            isHost={isHost}
            watchMode={watchMode}
            onWatchModeChange={setWatchMode}
            localProgress={localProgress}
            peerProgresses={peerProgresses}
          />
        </div>
      </section>
      <aside className={`min-h-0 min-w-0 flex-col gap-2 overflow-hidden lg:flex lg:h-full lg:flex-none ${chatCollapsed ? "hidden lg:flex" : "flex flex-1"}`}>
        <div className="hidden shrink-0 lg:block">
          <RoomControls
            roomId={params.roomId}
            socket={socket}
            nickname={nickname.trim()}
            status={status}
            syncEvents={syncEvents}
            hostNickname={hostNickname}
            isHost={isHost}
            watchMode={watchMode}
            onWatchModeChange={setWatchMode}
            localProgress={localProgress}
            peerProgresses={peerProgresses}
          />
        </div>
        <ChatPanel
          className="min-h-0 flex-1"
          roomId={params.roomId}
          socket={socket}
          nickname={nickname.trim()}
          roomPassword={roomPassword}
          collapsed={chatCollapsed}
          onCollapsedChange={(next) => {
            setChatCollapsed(next);
            if (!next) {
              setChatUnread(0);
              setChatPreview("");
            }
          }}
          onIncomingMessage={onIncomingChatMessage}
        />
      </aside>
    </main>
  );
}

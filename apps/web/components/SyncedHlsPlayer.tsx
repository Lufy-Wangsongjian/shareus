"use client";

import {
  calculateExpectedPosition,
  calculatePlaybackRate,
  shouldCorrectDrift,
  shouldSoftSync,
  type PlaybackState
} from "@shareus/shared";
import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { formatPlaybackTime } from "../lib/formatTime";
import type { PeerProgressView, WatchMode } from "../lib/watchMode";

interface SyncedHlsPlayerProps {
  src: string;
  roomId: string;
  videoId: string;
  nickname: string;
  socket: Socket | null;
  watchMode: WatchMode;
  initialPlaybackState: PlaybackState | null;
  onSyncEvent: (message: string) => void;
  onHostChange: (input: { hostNickname: string; isHost: boolean }) => void;
  onLocalProgress: (progress: PeerProgressView | null) => void;
  overlay?: ReactNode;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

function describePlaybackState(state: PlaybackState): string {
  const expected = calculateExpectedPosition({
    isPlaying: state.isPlaying,
    positionSec: state.positionSec,
    updatedAtMs: new Date(state.updatedAt).getTime(),
    nowMs: Date.now()
  });
  return `${formatPlaybackTime(expected)} · ${state.isPlaying ? "播放中" : "已暂停"}`;
}

export function SyncedHlsPlayer({
  src,
  roomId,
  videoId,
  nickname,
  socket,
  watchMode,
  initialPlaybackState,
  onSyncEvent,
  onHostChange,
  onLocalProgress,
  overlay,
  onFullscreenChange
}: SyncedHlsPlayerProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const playerRootRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRedirectRef = useRef(false);
  const hlsRef = useRef<Hls | null>(null);
  const suppressRef = useRef(false);
  const readyRef = useRef(false);
  const localBufferingRef = useRef(false);
  const isHostRef = useRef(false);
  const watchModeRef = useRef(watchMode);
  const pendingStateRef = useRef<PlaybackState | null>(initialPlaybackState);
  const lastRemoteStateRef = useRef<PlaybackState | null>(initialPlaybackState);
  const nicknameRef = useRef(nickname);
  const socketRef = useRef(socket);
  const onSyncEventRef = useRef(onSyncEvent);
  const onHostChangeRef = useRef(onHostChange);
  const onLocalProgressRef = useRef(onLocalProgress);
  const wasSoftSyncingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  useEffect(() => {
    onFullscreenChange?.(isPlayerFullscreen);
  }, [isPlayerFullscreen, onFullscreenChange]);

  nicknameRef.current = nickname;
  socketRef.current = socket;
  watchModeRef.current = watchMode;
  onSyncEventRef.current = onSyncEvent;
  onHostChangeRef.current = onHostChange;
  onLocalProgressRef.current = onLocalProgress;

  const logSync = useCallback((message: string) => {
    onSyncEventRef.current(message);
  }, []);

  function buildLocalProgress(isPlaying: boolean): PeerProgressView | null {
    const video = ref.current;
    const currentSocket = socketRef.current;
    if (!video || !currentSocket) {
      return null;
    }

    return {
      socketId: currentSocket.id ?? "local",
      nickname: nicknameRef.current,
      isPlaying,
      positionSec: video.currentTime,
      updatedAt: new Date().toISOString(),
      isBuffering: localBufferingRef.current
    };
  }

  function emitPeerProgress(isPlaying: boolean) {
    const video = ref.current;
    const currentSocket = socketRef.current;
    if (!video || !currentSocket || suppressRef.current || watchModeRef.current !== "free") {
      return;
    }

    const progress = buildLocalProgress(isPlaying);
    if (!progress) {
      return;
    }

    onLocalProgressRef.current(progress);
    currentSocket.emit("playback:peer-progress", {
      roomId,
      videoId,
      isPlaying,
      positionSec: video.currentTime,
      updatedAt: progress.updatedAt,
      updatedBy: nicknameRef.current
    });
  }

  function emitPlaybackUpdate(isPlaying: boolean) {
    const video = ref.current;
    const currentSocket = socketRef.current;
    if (!video || !currentSocket || suppressRef.current) {
      return;
    }

    if (watchModeRef.current === "free") {
      emitPeerProgress(isPlaying);
      return;
    }

    if (!isHostRef.current) {
      return;
    }

    currentSocket.emit("playback:update", {
      roomId,
      videoId,
      isPlaying,
      positionSec: video.currentTime,
      updatedAt: new Date().toISOString(),
      updatedBy: nicknameRef.current
    });
  }

  function emitBufferingState(isBuffering: boolean) {
    const currentSocket = socketRef.current;
    if (!currentSocket) {
      return;
    }

    currentSocket.emit("playback:buffering", { roomId, isBuffering });
    if (watchModeRef.current === "free") {
      return;
    }
    if (isBuffering) {
      logSync(`${nicknameRef.current} 正在缓冲…`);
    } else {
      logSync(`${nicknameRef.current} 缓冲结束，正在重新对齐`);
    }
  }

  function resetPlaybackRate(video: HTMLVideoElement) {
    if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }
  }

  function applyRemoteState(state: PlaybackState, options?: { silent?: boolean; initial?: boolean }) {
    if (watchModeRef.current === "free") {
      return;
    }

    const video = ref.current;
    if (!video || localBufferingRef.current) {
      pendingStateRef.current = state;
      return;
    }

    lastRemoteStateRef.current = state;

    const expected = calculateExpectedPosition({
      isPlaying: state.isPlaying,
      positionSec: state.positionSec,
      updatedAtMs: new Date(state.updatedAt).getTime(),
      nowMs: Date.now()
    });

    const needsHardSeek = shouldCorrectDrift({
      localPositionSec: video.currentTime,
      expectedPositionSec: expected
    });
    const needsPlay = state.isPlaying && video.paused;
    const needsPause = !state.isPlaying && !video.paused;

    if (!needsHardSeek && !needsPlay && !needsPause) {
      if (!needsHardSeek && !shouldSoftSync(video.currentTime, expected)) {
        resetPlaybackRate(video);
      }
      return;
    }

    suppressRef.current = true;

    if (needsHardSeek) {
      resetPlaybackRate(video);
      video.currentTime = expected;
    }

    if (needsPlay) {
      void video.play().catch(() => undefined);
    } else if (needsPause) {
      video.pause();
      resetPlaybackRate(video);
    }

    if (!options?.silent) {
      if (options?.initial) {
        logSync(`已同步到 ${describePlaybackState(state)}`);
      } else if (needsHardSeek) {
        logSync(`${state.updatedBy} 跳转到 ${formatPlaybackTime(expected)}（偏差 > 10 秒）`);
      } else if (needsPlay) {
        logSync(`${state.updatedBy} 开始播放`);
      } else if (needsPause) {
        logSync(`${state.updatedBy} 已暂停`);
      }
    }

    window.setTimeout(() => {
      suppressRef.current = false;
    }, 200);
  }

  function runSoftSync() {
    if (watchModeRef.current === "free") {
      return;
    }

    const video = ref.current;
    const state = lastRemoteStateRef.current;
    if (!video || !state || suppressRef.current || !readyRef.current || localBufferingRef.current) {
      return;
    }

    if (!state.isPlaying || video.paused) {
      resetPlaybackRate(video);
      return;
    }

    const expected = calculateExpectedPosition({
      isPlaying: state.isPlaying,
      positionSec: state.positionSec,
      updatedAtMs: new Date(state.updatedAt).getTime(),
      nowMs: Date.now()
    });

    if (shouldCorrectDrift({
      localPositionSec: video.currentTime,
      expectedPositionSec: expected
    })) {
      suppressRef.current = true;
      resetPlaybackRate(video);
      video.currentTime = expected;
      logSync(`自动硬同步到 ${formatPlaybackTime(expected)}（偏差 > 10 秒）`);
      window.setTimeout(() => {
        suppressRef.current = false;
      }, 200);
      return;
    }

    if (shouldSoftSync(video.currentTime, expected)) {
      const nextRate = calculatePlaybackRate(video.currentTime, expected);
      const drift = Math.abs(expected - video.currentTime);
      if (video.playbackRate !== nextRate) {
        video.playbackRate = nextRate;
      }
      if (!wasSoftSyncingRef.current) {
        wasSoftSyncingRef.current = true;
        logSync(`软同步中 · 偏差 ${drift.toFixed(1)} 秒 · 速率 ${nextRate.toFixed(2)}×`);
      }
      return;
    }

    if (wasSoftSyncingRef.current) {
      wasSoftSyncingRef.current = false;
      logSync("软同步完成 · 进度已对齐");
    }
    resetPlaybackRate(video);
  }

  function refreshLocalProgressDisplay() {
    if (watchModeRef.current !== "free") {
      onLocalProgressRef.current(null);
      return;
    }

    const video = ref.current;
    if (!video) {
      return;
    }

    const progress = buildLocalProgress(!video.paused);
    if (progress) {
      onLocalProgressRef.current(progress);
    }
  }

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    setError(null);
    readyRef.current = false;

    function onReady() {
      readyRef.current = true;
      if (watchModeRef.current === "sync" && pendingStateRef.current) {
        applyRemoteState(pendingStateRef.current, { initial: true });
        pendingStateRef.current = null;
      }
      if (watchModeRef.current === "free" && ref.current) {
        emitPeerProgress(!ref.current.paused);
      }
    }

    function onPlay() {
      emitPlaybackUpdate(true);
    }

    function onPause() {
      emitPlaybackUpdate(false);
    }

    function onSeeked() {
      const current = ref.current;
      if (!current) return;
      emitPlaybackUpdate(!current.paused);
    }

    function onWaiting() {
      const current = ref.current;
      if (!current || localBufferingRef.current) return;
      localBufferingRef.current = true;
      resetPlaybackRate(current);
      emitBufferingState(true);
      if (watchModeRef.current === "free") {
        emitPeerProgress(!current.paused);
      }
    }

    function onPlaying() {
      if (!localBufferingRef.current) return;
      localBufferingRef.current = false;
      emitBufferingState(false);
      if (watchModeRef.current === "sync" && lastRemoteStateRef.current) {
        applyRemoteState(lastRemoteStateRef.current, { silent: true });
      }
      if (watchModeRef.current === "free") {
        emitPeerProgress(!ref.current?.paused);
      }
    }

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 15
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("视频加载失败，请刷新页面重试");
        }
      });
    } else {
      setError("当前浏览器不支持 HLS 播放");
    }

    return () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (!socket) return;

    function onRemoteUpdate(payload: PlaybackState & { roomId: string }) {
      if (payload.roomId !== roomId) return;
      applyRemoteState(payload);
    }

    function onRoomState(payload: PlaybackState & { roomId: string }) {
      if (payload.roomId !== roomId) return;
      if (watchModeRef.current === "free") {
        return;
      }
      applyRemoteState(payload, { initial: true });
    }

    function onHost(payload: { roomId: string; hostSocketId: string; hostNickname: string }) {
      if (payload.roomId !== roomId) return;
      const isHost = payload.hostSocketId === socketRef.current?.id;
      isHostRef.current = isHost;
      onHostChangeRef.current({ hostNickname: payload.hostNickname, isHost });
      if (watchModeRef.current === "sync") {
        logSync(isHost ? "你已成为主控" : `主控：${payload.hostNickname}`);
      }
    }

    function onRemoteBuffering(payload: {
      roomId: string;
      isBuffering: boolean;
      nickname: string;
      socketId: string;
    }) {
      if (payload.roomId !== roomId || payload.socketId === socketRef.current?.id) return;
      if (watchModeRef.current === "free") {
        return;
      }
      if (payload.isBuffering) {
        logSync(`${payload.nickname} 网络不稳定，正在缓冲…`);
      } else {
        logSync(`${payload.nickname} 缓冲结束`);
      }
    }

    socket.on("playback:remote-update", onRemoteUpdate);
    socket.on("playback:state", onRoomState);
    socket.on("room:host", onHost);
    socket.on("playback:buffering", onRemoteBuffering);

    return () => {
      socket.off("playback:remote-update", onRemoteUpdate);
      socket.off("playback:state", onRoomState);
      socket.off("room:host", onHost);
      socket.off("playback:buffering", onRemoteBuffering);
    };
  }, [socket, roomId, logSync]);

  useEffect(() => {
    const timer = window.setInterval(runSoftSync, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (watchMode !== "free") {
      onLocalProgressRef.current(null);
      const video = ref.current;
      if (video) {
        resetPlaybackRate(video);
      }
      if (watchMode === "sync" && lastRemoteStateRef.current && readyRef.current) {
        applyRemoteState(lastRemoteStateRef.current, { initial: true });
      }
      return;
    }

    const timer = window.setInterval(() => {
      refreshLocalProgressDisplay();
      const video = ref.current;
      if (video && !video.paused) {
        emitPeerProgress(true);
      }
    }, 3000);

    refreshLocalProgressDisplay();
    if (readyRef.current) {
      const video = ref.current;
      if (video) {
        emitPeerProgress(!video.paused);
      }
    }

    return () => window.clearInterval(timer);
  }, [watchMode]);

  const togglePlayerFullscreen = useCallback(async () => {
    const root = playerRootRef.current;
    if (!root) {
      return;
    }
    if (document.fullscreenElement === root) {
      await document.exitFullscreen();
      setIsPlayerFullscreen(false);
    } else {
      await root.requestFullscreen();
      setIsPlayerFullscreen(true);
    }
  }, []);

  useEffect(() => {
    const video = ref.current;
    const root = playerRootRef.current;
    if (!video || !root) {
      return;
    }

    async function redirectVideoFullscreen() {
      const fullscreenElement = document.fullscreenElement
        ?? (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;

      if (fullscreenElement === root) {
        setIsPlayerFullscreen(true);
        return;
      }

      if (!fullscreenElement) {
        setIsPlayerFullscreen(false);
      }

      if (fullscreenElement !== video || fullscreenRedirectRef.current) {
        return;
      }

      fullscreenRedirectRef.current = true;
      try {
        await document.exitFullscreen();
        if (root) {
          await root.requestFullscreen();
          setIsPlayerFullscreen(true);
        }
      } catch {
        // Browser may reject programmatic fullscreen; ignore.
      } finally {
        fullscreenRedirectRef.current = false;
      }
    }

    async function onWebkitBeginFullscreen() {
      const videoElement = video as HTMLVideoElement & {
        webkitExitFullscreen?: () => void;
        webkitDisplayingFullscreen?: boolean;
      };
      if (fullscreenRedirectRef.current || !root) {
        return;
      }
      fullscreenRedirectRef.current = true;
      try {
        videoElement.webkitExitFullscreen?.();
        await root.requestFullscreen();
        setIsPlayerFullscreen(true);
      } catch {
        // iOS may reject programmatic fullscreen; keep native state.
      } finally {
        fullscreenRedirectRef.current = false;
      }
    }

    function onWebkitEndFullscreen() {
      if (document.fullscreenElement !== root) {
        setIsPlayerFullscreen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "f" && event.key !== "F") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      void togglePlayerFullscreen();
    }

    function onDoubleClick(event: MouseEvent) {
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      void togglePlayerFullscreen();
    }

    root.addEventListener("dblclick", onDoubleClick);
    video.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen);
    video.addEventListener("webkitendfullscreen", onWebkitEndFullscreen);
    document.addEventListener("fullscreenchange", redirectVideoFullscreen);
    document.addEventListener("webkitfullscreenchange", redirectVideoFullscreen);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      root.removeEventListener("dblclick", onDoubleClick);
      video.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen);
      video.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen);
      document.removeEventListener("fullscreenchange", redirectVideoFullscreen);
      document.removeEventListener("webkitfullscreenchange", redirectVideoFullscreen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [src, togglePlayerFullscreen]);

  return (
    <div className="flex h-full flex-col space-y-2">
      <div
        ref={playerRootRef}
        data-shareus-player-root
        className="relative h-full min-h-0 w-full bg-black [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:justify-center"
      >
        <video
          ref={ref}
          className="aspect-video h-full max-h-full w-full bg-black object-contain [&:fullscreen]:aspect-auto [&:fullscreen]:h-full [&:fullscreen]:max-h-none"
          controls
          playsInline
          controlsList="nofullscreen"
        />
        {overlay}
        <button
          type="button"
          aria-label={isPlayerFullscreen ? "退出全屏" : "全屏播放"}
          className="absolute bottom-4 left-4 z-50 rounded-md bg-black/60 px-2.5 py-1 text-xs text-white/90 hover:bg-black/80"
          onClick={() => {
            void togglePlayerFullscreen();
          }}
        >
          {isPlayerFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

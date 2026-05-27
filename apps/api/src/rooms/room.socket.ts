import type { Server as HttpServer } from "node:http";
import { createChatMessageId, createWatchLogId, canControlWatchMode, type PlaybackState } from "@shareus/shared";
import { Server } from "socket.io";
import { z } from "zod";
import type { ChatMessageRecord } from "./chat.model.js";
import type { WatchLogRecord } from "./watchLog.model.js";

export const playbackSocketPayloadSchema = z.object({
  roomId: z.string().min(1),
  videoId: z.string().min(1),
  isPlaying: z.boolean(),
  positionSec: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1)
});

const chatMessageSchema = z.discriminatedUnion("type", [
  z.object({
    roomId: z.string().min(1),
    type: z.literal("text"),
    message: z.string().trim().min(1).max(500)
  }),
  z.object({
    roomId: z.string().min(1),
    type: z.literal("image"),
    message: z.string().trim().max(500).optional(),
    imageObjectPath: z.string().min(1)
  })
]);

const roomJoinSchema = z.object({
  roomId: z.string().min(1),
  nickname: z.string().trim().min(1).max(20)
});

const bufferingSchema = z.object({
  roomId: z.string().min(1),
  isBuffering: z.boolean()
});

const watchModeSchema = z.object({
  roomId: z.string().min(1),
  mode: z.enum(["sync", "free"])
});

const watchLogSchema = z.object({
  roomId: z.string().min(1),
  message: z.string().trim().min(1).max(500)
});

export type WatchMode = "sync" | "free";

export interface PeerProgress {
  socketId: string;
  nickname: string;
  videoId: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: string;
  isBuffering: boolean;
}

export interface RoomSocketDeps {
  getRoomPlaybackState: (roomId: string) => Promise<{
    videoId: string;
    playbackState: PlaybackState | null;
  } | null>;
  savePlaybackState: (roomId: string, playbackState: PlaybackState) => Promise<void>;
  saveChatMessage: (message: ChatMessageRecord) => Promise<ChatMessageRecord>;
  listChatMessages: (roomId: string, limit?: number) => Promise<ChatMessageRecord[]>;
  saveWatchLog: (entry: WatchLogRecord) => Promise<WatchLogRecord>;
}

function nicknameOf(socket: { data: Record<string, unknown> }): string {
  return typeof socket.data.nickname === "string" ? socket.data.nickname : "访客";
}

async function broadcastHost(io: Server, roomId: string, hostSocketId: string): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets();
  const host = sockets.find((entry) => entry.id === hostSocketId);
  io.to(roomId).emit("room:host", {
    roomId,
    hostSocketId,
    hostNickname: host ? nicknameOf(host) : "主控"
  });
}

async function recordWatchLog(
  deps: RoomSocketDeps | undefined,
  input: { roomId: string; message: string; nickname?: string }
): Promise<void> {
  if (!deps) {
    return;
  }

  await deps.saveWatchLog({
    id: createWatchLogId(),
    roomId: input.roomId,
    message: input.message,
    nickname: input.nickname,
    createdAt: new Date().toISOString()
  });
}

function formatPlaybackTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function attachRoomSocket(httpServer: HttpServer, deps?: RoomSocketDeps): Server {
  const io = new Server(httpServer, {
    cors: { origin: true }
  });
  const roomHosts = new Map<string, string>();
  const roomWatchModes = new Map<string, WatchMode>();
  const roomPeerProgress = new Map<string, Map<string, PeerProgress>>();

  function peerProgressMap(roomId: string): Map<string, PeerProgress> {
    let map = roomPeerProgress.get(roomId);
    if (!map) {
      map = new Map();
      roomPeerProgress.set(roomId, map);
    }
    return map;
  }

  io.on("connection", (socket) => {
    socket.on("room:join", async (payload: unknown) => {
      const parsed = roomJoinSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid room join payload" });
        return;
      }

      socket.data.nickname = parsed.data.nickname;
      socket.join(parsed.data.roomId);

      let hostSocketId = roomHosts.get(parsed.data.roomId);
      if (!hostSocketId) {
        hostSocketId = socket.id;
        roomHosts.set(parsed.data.roomId, hostSocketId);
      }
      socket.data.isHost = socket.id === hostSocketId;
      await broadcastHost(io, parsed.data.roomId, hostSocketId);

      if (!deps) {
        return;
      }

      const room = await deps.getRoomPlaybackState(parsed.data.roomId);
      if (room?.playbackState) {
        socket.emit("playback:state", {
          roomId: parsed.data.roomId,
          ...room.playbackState
        });
      }

      const messages = await deps.listChatMessages(parsed.data.roomId);
      socket.emit("chat:history", {
        roomId: parsed.data.roomId,
        messages
      });

      socket.emit("room:watch-mode", {
        roomId: parsed.data.roomId,
        mode: roomWatchModes.get(parsed.data.roomId) ?? "free",
        changedBy: null
      });

      const peers = [...peerProgressMap(parsed.data.roomId).values()].filter(
        (entry) => entry.socketId !== socket.id
      );
      if (peers.length > 0) {
        socket.emit("playback:peer-snapshot", {
          roomId: parsed.data.roomId,
          peers
        });
      }

      await recordWatchLog(deps, {
        roomId: parsed.data.roomId,
        nickname: parsed.data.nickname,
        message: `${parsed.data.nickname} 加入了房间`
      });
    });

    socket.on("room:watch-mode", (payload: unknown) => {
      const parsed = watchModeSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const nickname = nicknameOf(socket);
      if (!canControlWatchMode(nickname)) {
        return;
      }

      roomWatchModes.set(parsed.data.roomId, parsed.data.mode);
      const modeLabel = parsed.data.mode === "free" ? "各看各的" : "同步观影";
      void recordWatchLog(deps, {
        roomId: parsed.data.roomId,
        nickname,
        message: `${nickname} 切换为${modeLabel}`
      });
      io.to(parsed.data.roomId).emit("room:watch-mode", {
        roomId: parsed.data.roomId,
        mode: parsed.data.mode,
        changedBy: nicknameOf(socket)
      });
    });

    socket.on("playback:peer-progress", (payload: unknown) => {
      const parsed = playbackSocketPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const progress: PeerProgress = {
        socketId: socket.id,
        nickname: parsed.data.updatedBy,
        videoId: parsed.data.videoId,
        isPlaying: parsed.data.isPlaying,
        positionSec: parsed.data.positionSec,
        updatedAt: parsed.data.updatedAt,
        isBuffering: false
      };

      peerProgressMap(parsed.data.roomId).set(socket.id, progress);
      socket.to(parsed.data.roomId).emit("playback:peer-progress", progress);
    });

    socket.on("playback:update", async (payload: unknown) => {
      const parsed = playbackSocketPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid playback payload" });
        return;
      }

      if (roomHosts.get(parsed.data.roomId) !== socket.id) {
        return;
      }

      const playbackState: PlaybackState = {
        videoId: parsed.data.videoId,
        isPlaying: parsed.data.isPlaying,
        positionSec: parsed.data.positionSec,
        updatedAt: parsed.data.updatedAt,
        updatedBy: parsed.data.updatedBy
      };

      if (deps) {
        await deps.savePlaybackState(parsed.data.roomId, playbackState);
      }

      const action = parsed.data.isPlaying ? "播放" : "暂停";
      void recordWatchLog(deps, {
        roomId: parsed.data.roomId,
        nickname: parsed.data.updatedBy,
        message: `${parsed.data.updatedBy} ${action} · ${formatPlaybackTime(parsed.data.positionSec)}`
      });

      socket.to(parsed.data.roomId).emit("playback:remote-update", parsed.data);
    });

    socket.on("playback:buffering", (payload: unknown) => {
      const parsed = bufferingSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const roomId = parsed.data.roomId;
      const mode = roomWatchModes.get(roomId) ?? "free";
      if (mode === "free") {
        const existing = peerProgressMap(roomId).get(socket.id);
        if (existing) {
          existing.isBuffering = parsed.data.isBuffering;
          socket.to(roomId).emit("playback:peer-progress", existing);
        }
      }

      socket.to(roomId).emit("playback:buffering", {
        roomId,
        isBuffering: parsed.data.isBuffering,
        nickname: nicknameOf(socket),
        socketId: socket.id
      });
    });

    socket.on("chat:message", async (payload: unknown) => {
      const parsed = chatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const record: ChatMessageRecord = parsed.data.type === "image"
        ? {
            id: createChatMessageId(),
            roomId: parsed.data.roomId,
            nickname: nicknameOf(socket),
            message: parsed.data.message?.trim() ?? "",
            sentAt: new Date().toISOString(),
            type: "image",
            imageObjectPath: parsed.data.imageObjectPath
          }
        : {
            id: createChatMessageId(),
            roomId: parsed.data.roomId,
            nickname: nicknameOf(socket),
            message: parsed.data.message,
            sentAt: new Date().toISOString(),
            type: "text"
          };

      if (deps) {
        await deps.saveChatMessage(record);
      }

      io.to(parsed.data.roomId).emit("chat:message", {
        ...record,
        socketId: socket.id
      });
    });

    socket.on("watch:log", async (payload: unknown) => {
      const parsed = watchLogSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      if (!socket.rooms.has(parsed.data.roomId)) {
        return;
      }

      await recordWatchLog(deps, {
        roomId: parsed.data.roomId,
        nickname: nicknameOf(socket),
        message: parsed.data.message
      });
    });

    socket.on("disconnecting", async () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) {
          continue;
        }

        const peers = peerProgressMap(roomId);
        if (peers.has(socket.id)) {
          peers.delete(socket.id);
          socket.to(roomId).emit("playback:peer-left", {
            roomId,
            socketId: socket.id,
            nickname: nicknameOf(socket)
          });
        }

        void recordWatchLog(deps, {
          roomId,
          nickname: nicknameOf(socket),
          message: `${nicknameOf(socket)} 离开了房间`
        });

        if (roomHosts.get(roomId) !== socket.id) {
          continue;
        }

        roomHosts.delete(roomId);
        const remaining = await io.in(roomId).fetchSockets();
        const next = remaining.find((entry) => entry.id !== socket.id);
        if (!next) {
          continue;
        }

        roomHosts.set(roomId, next.id);
        next.data.isHost = true;
        await broadcastHost(io, roomId, next.id);
        void recordWatchLog(deps, {
          roomId,
          nickname: nicknameOf(next),
          message: `${nicknameOf(next)} 成为主控`
        });
      }
    });
  });

  return io;
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { rewritePlaylistWithSignedSegments } from "../gcs/playlist.js";
import type { VideoRecord } from "../videos/video.model.js";
import { createRoomService, type RoomRepository } from "./room.service.js";

const createRoomSchema = z.object({
  videoId: z.string().min(1),
  password: z.string().min(4)
});

const joinRoomSchema = z.object({
  password: z.string().min(1)
});

export interface RoomPlaybackGateway {
  getVideo: (videoId: string) => Promise<VideoRecord | null>;
  readText: (objectPath: string) => Promise<string>;
  signReadUrl: (objectPath: string) => Promise<string>;
}

export async function registerRoomRoutes(
  server: FastifyInstance,
  config: AppConfig,
  repo: RoomRepository,
  playback?: RoomPlaybackGateway
): Promise<void> {
  const rooms = createRoomService(repo);

  server.get("/api/rooms", async () => {
    const openRooms = await repo.listOpenRooms();
    return Promise.all(openRooms.map(async (room) => {
      const video = await repo.getVideo(room.videoId);
      return {
        id: room.id,
        videoId: room.videoId,
        videoTitle: video?.title ?? "未知影片",
        status: room.status,
        createdAt: room.createdAt
      };
    }));
  });

  server.post("/api/rooms", async (request, reply) => {
    const token = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    try {
      await verifyAdminToken({ token, secret: config.adminTokenSecret });
    } catch {
      return reply.code(401).send({ message: "Admin authorization is required" });
    }

    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Video id and room password are required" });
    }

    try {
      return await rooms.createRoom(parsed.data);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Room creation failed" });
    }
  });

  server.post<{ Params: { roomId: string } }>("/api/rooms/:roomId/join", async (request, reply) => {
    const parsed = joinRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Room password is required" });
    }

    try {
      const room = await rooms.joinRoom({ roomId: request.params.roomId, password: parsed.data.password });
      return { roomId: room.id, videoId: room.videoId, playbackState: room.playbackState };
    } catch (error) {
      return reply.code(401).send({ message: error instanceof Error ? error.message : "Join failed" });
    }
  });

  if (playback) {
    server.get<{ Params: { roomId: string } }>("/api/rooms/:roomId/playlist.m3u8", async (request, reply) => {
      const room = await repo.getRoom(request.params.roomId);
      if (!room || room.status !== "open") {
        return reply.code(404).send({ message: "Room not found" });
      }

      const video = await playback.getVideo(room.videoId);
      if (!video?.hlsPrefix) {
        return reply.code(404).send({ message: "Video is not ready for playback" });
      }

      const playlistPath = `${video.hlsPrefix.replace(/\/$/, "")}/index.m3u8`;
      const playlist = await playback.readText(playlistPath);
      const rewritten = await rewritePlaylistWithSignedSegments({
        playlist,
        hlsPrefix: video.hlsPrefix,
        signSegment: playback.signReadUrl
      });

      reply.header("content-type", "application/vnd.apple.mpegurl");
      return rewritten;
    });
  }
}

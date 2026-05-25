import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { rewritePlaylistWithProxySegments } from "../gcs/playlist.js";
import { createChatMessageId } from "@shareus/shared";
import type { VideoRecord } from "../videos/video.model.js";
import { createRoomService, type RoomRepository } from "./room.service.js";

const createRoomSchema = z.object({
  videoId: z.string().min(1),
  password: z.string().min(4)
});

const joinRoomSchema = z.object({
  password: z.string().min(1)
});

const chatImageUploadSchema = z.object({
  password: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  dataBase64: z.string().min(1)
});

const MAX_CHAT_IMAGE_BYTES = 3 * 1024 * 1024;

export interface RoomPlaybackGateway {
  getVideo: (videoId: string) => Promise<VideoRecord | null>;
  readText: (objectPath: string) => Promise<string>;
  signReadUrl?: (objectPath: string) => Promise<string>;
  getObjectSize?: (objectPath: string) => Promise<number>;
  openReadStream?: (objectPath: string, range?: { start: number; end?: number }) => NodeJS.ReadableStream;
  writeBuffer?: (objectPath: string, data: Buffer, contentType: string) => Promise<void>;
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
      const rewritten = rewritePlaylistWithProxySegments(playlist);

      reply.header("content-type", "application/vnd.apple.mpegurl");
      return rewritten;
    });

    server.get<{ Params: { roomId: string; filename: string } }>("/api/rooms/:roomId/hls/:filename", async (request, reply) => {
      if (!playback.openReadStream || !playback.getObjectSize) {
        return reply.code(501).send({ message: "HLS streaming is not configured" });
      }

      const room = await repo.getRoom(request.params.roomId);
      if (!room || room.status !== "open") {
        return reply.code(404).send({ message: "Room not found" });
      }

      const video = await playback.getVideo(room.videoId);
      if (!video?.hlsPrefix) {
        return reply.code(404).send({ message: "Video is not ready for playback" });
      }

      const filename = request.params.filename;
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return reply.code(400).send({ message: "Invalid segment name" });
      }

      const objectPath = `${video.hlsPrefix.replace(/\/$/, "")}/${filename}`;
      const totalSize = await playback.getObjectSize(objectPath);
      const rangeHeader = request.headers.range;
      const contentType = filename.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : filename.endsWith(".mp4")
          ? "video/mp4"
          : "video/mp2t";

      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
        if (!match) {
          return reply.code(416).send({ message: "Invalid range" });
        }

        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : totalSize - 1;
        if (start >= totalSize || end >= totalSize || start > end) {
          return reply.code(416).send({ message: "Range not satisfiable" });
        }

        reply
          .code(206)
          .header("content-type", contentType)
          .header("accept-ranges", "bytes")
          .header("content-range", `bytes ${start}-${end}/${totalSize}`)
          .header("content-length", String(end - start + 1));

        return reply.send(playback.openReadStream(objectPath, { start, end }));
      }

      reply
        .header("content-type", contentType)
        .header("accept-ranges", "bytes")
        .header("content-length", String(totalSize));

      return reply.send(playback.openReadStream(objectPath));
    });

    server.post<{ Params: { roomId: string } }>("/api/rooms/:roomId/chat-images", async (request, reply) => {
      if (!playback.writeBuffer) {
        return reply.code(501).send({ message: "Chat image upload is not configured" });
      }

      const parsed = chatImageUploadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: "Invalid chat image payload" });
      }

      try {
        await rooms.joinRoom({ roomId: request.params.roomId, password: parsed.data.password });
      } catch {
        return reply.code(401).send({ message: "Invalid room password" });
      }

      const buffer = Buffer.from(parsed.data.dataBase64, "base64");
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_CHAT_IMAGE_BYTES) {
        return reply.code(400).send({ message: "Image must be between 1 byte and 3MB" });
      }

      const imageId = createChatMessageId();
      const extension = parsed.data.contentType === "image/png"
        ? "png"
        : parsed.data.contentType === "image/webp"
          ? "webp"
          : parsed.data.contentType === "image/gif"
            ? "gif"
            : "jpg";
      const imageObjectPath = `chat-images/${request.params.roomId}/${imageId}.${extension}`;

      await playback.writeBuffer(imageObjectPath, buffer, parsed.data.contentType);
      return { imageId, imageObjectPath };
    });

    server.get<{ Params: { roomId: string; imageId: string } }>(
      "/api/rooms/:roomId/chat-images/:imageId",
      async (request, reply) => {
        if (!playback.openReadStream || !playback.getObjectSize) {
          return reply.code(501).send({ message: "Chat image streaming is not configured" });
        }

        const room = await repo.getRoom(request.params.roomId);
        if (!room || room.status !== "open") {
          return reply.code(404).send({ message: "Room not found" });
        }

        const filename = request.params.imageId;
        if (!/^msg_[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)$/.test(filename)) {
          return reply.code(400).send({ message: "Invalid image id" });
        }

        const objectPath = `chat-images/${request.params.roomId}/${filename}`;

        let totalSize: number;
        try {
          totalSize = await playback.getObjectSize(objectPath);
        } catch {
          return reply.code(404).send({ message: "Image not found" });
        }

        const contentType = filename.endsWith(".png")
          ? "image/png"
          : filename.endsWith(".webp")
            ? "image/webp"
            : filename.endsWith(".gif")
              ? "image/gif"
              : "image/jpeg";

        reply
          .header("content-type", contentType)
          .header("cache-control", "private, max-age=3600")
          .header("content-length", String(totalSize));

        return reply.send(playback.openReadStream(objectPath));
      }
    );
  }
}

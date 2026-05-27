import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/auth.routes.js";
import type { AppConfig } from "./config.js";
import { createFirestoreAdapter } from "./firestore.js";
import { createStorageAdapter } from "./gcs/storage.js";
import { registerRoomRoutes, type RoomPlaybackGateway } from "./rooms/room.routes.js";
import type { RoomRepository } from "./rooms/room.service.js";
import { createCloudRunJobStarter } from "./transcode/cloudRunJob.js";
import { registerTranscodeRoutes } from "./transcode/transcode.routes.js";
import type { TranscodeGateway } from "./transcode/transcode.service.js";
import { registerVideoRoutes } from "./videos/video.routes.js";
import type { VideoRecord } from "./videos/video.model.js";
import type { VideoRepository } from "./videos/video.service.js";

export interface ServerDeps {
  videoRepo?: VideoRepository;
  roomRepo?: RoomRepository;
  transcodeGateway?: TranscodeGateway;
  roomPlayback?: RoomPlaybackGateway;
}

function isVideoRepository(value: VideoRepository | ServerDeps): value is VideoRepository {
  return typeof (value as VideoRepository).objectExists === "function"
    && typeof (value as ServerDeps).videoRepo === "undefined"
    && typeof (value as ServerDeps).roomRepo === "undefined"
    && typeof (value as ServerDeps).transcodeGateway === "undefined";
}

function normalizeDeps(deps: VideoRepository | ServerDeps = {}): ServerDeps {
  return isVideoRepository(deps) ? { videoRepo: deps } : deps;
}

export function createProductionDeps(config: AppConfig): ServerDeps {
  const firestore = createFirestoreAdapter();
  const storage = createStorageAdapter(config.gcsBucket);

  return {
    videoRepo: {
      objectExists: storage.objectExists,
      saveVideo: firestore.saveVideo,
      listVideos: firestore.listVideos,
      getVideo: firestore.getVideo,
      deleteVideo: firestore.deleteVideo,
      deletePrefix: storage.deletePrefix
    },
    roomRepo: {
      getVideo: async (videoId) => {
        const video = await firestore.getVideo(videoId);
        return video ? { id: video.id, status: video.status, title: video.title } : null;
      },
      saveRoom: firestore.saveRoom,
      getRoom: firestore.getRoom,
      updateRoom: firestore.updateRoom,
      listOpenRooms: firestore.listOpenRooms,
      listAllRooms: firestore.listAllRooms,
      deleteRoom: firestore.deleteRoom,
      saveWatchLog: firestore.saveWatchLog,
      listWatchLogs: firestore.listWatchLogs
    },
    roomPlayback: {
      getVideo: firestore.getVideo,
      readText: storage.readText,
      signReadUrl: storage.signReadUrl,
      getObjectSize: storage.getObjectSize,
      openReadStream: storage.openReadStream,
      writeBuffer: storage.writeBuffer,
      deletePrefix: storage.deletePrefix
    },
    transcodeGateway: {
      startJob: createCloudRunJobStarter(config),
      getVideo: async (videoId: string) => {
        const video = await firestore.getVideo(videoId);
        return video ? { id: video.id, sourceObjectPath: video.sourceObjectPath, status: video.status } : null;
      },
      markProcessing: async (videoId: string) => {
        await firestore.updateVideo(videoId, {
          status: "processing",
          failureMessage: null,
          updatedAt: new Date().toISOString()
        });
      },
      markFailed: async (videoId: string, message: string) => {
        await firestore.updateVideo(videoId, {
          status: "failed",
          failureMessage: message,
          updatedAt: new Date().toISOString()
        });
      }
    }
  };
}

export async function buildServer(config: AppConfig, deps: VideoRepository | ServerDeps = {}) {
  const normalizedDeps = normalizeDeps(deps);
  const server = Fastify({ logger: true });
  await server.register(cors, { origin: true });
  await server.register(rateLimit, { global: false });
  await server.register(sensible);

  const videoRepo = normalizedDeps.videoRepo ?? createMemoryVideoRepository();
  const roomRepo = normalizedDeps.roomRepo ?? createMemoryRoomRepository(videoRepo);
  const transcodeGateway = normalizedDeps.transcodeGateway ?? createMemoryTranscodeGateway(videoRepo);

  server.get("/healthz", async () => ({ ok: true }));
  await registerAuthRoutes(server, config);
  await registerVideoRoutes(server, config, videoRepo);
  await registerRoomRoutes(server, config, roomRepo, normalizedDeps.roomPlayback ?? createMemoryRoomPlayback(videoRepo));
  await registerTranscodeRoutes(server, config, transcodeGateway);

  return server;
}

function createMemoryRoomPlayback(videoRepo: VideoRepository): RoomPlaybackGateway | undefined {
  if (!videoRepo.getVideo) {
    return undefined;
  }

  return {
    getVideo: videoRepo.getVideo,
    readText: async () => "",
    signReadUrl: async (objectPath: string) => objectPath
  };
}

function createMemoryVideoRepository(): VideoRepository {
  const videos = new Map<string, VideoRecord>();

  return {
    objectExists: async () => false,
    saveVideo: async (video) => {
      videos.set(video.id, video);
      return video;
    },
    listVideos: async () => [...videos.values()],
    getVideo: async (videoId) => videos.get(videoId) ?? null,
    deleteVideo: async (videoId) => {
      videos.delete(videoId);
    },
    deletePrefix: async () => undefined
  };
}

function createMemoryRoomRepository(videoRepo: VideoRepository): RoomRepository {
  const rooms = new Map<string, import("./rooms/room.model.js").RoomRecord>();

  return {
    getVideo: async (videoId) => {
      const video = videoRepo.getVideo ? await videoRepo.getVideo(videoId) : null;
      return video ? { id: video.id, status: video.status, title: video.title } : null;
    },
    saveRoom: async (room) => {
      rooms.set(room.id, room);
      return room;
    },
    getRoom: async (roomId) => rooms.get(roomId) ?? null,
    updateRoom: async (roomId, patch) => {
      const room = rooms.get(roomId);
      if (room) {
        rooms.set(roomId, { ...room, ...patch });
      }
    },
    listOpenRooms: async () => [...rooms.values()]
      .filter((room) => room.status === "open")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    listAllRooms: async () => [...rooms.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    deleteRoom: async (roomId) => {
      rooms.delete(roomId);
    },
    saveWatchLog: async (entry) => entry,
    listWatchLogs: async () => []
  };
}

function createMemoryTranscodeGateway(videoRepo: VideoRepository): TranscodeGateway {
  return {
    startJob: async () => undefined,
    getVideo: async (videoId) => {
      const video = videoRepo.getVideo ? await videoRepo.getVideo(videoId) : null;
      return video ? { id: video.id, sourceObjectPath: video.sourceObjectPath, status: video.status } : null;
    },
    markProcessing: async () => undefined,
    markFailed: async () => undefined
  };
}

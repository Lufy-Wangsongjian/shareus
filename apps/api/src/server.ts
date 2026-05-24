import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/auth.routes.js";
import type { AppConfig } from "./config.js";
import { registerVideoRoutes } from "./videos/video.routes.js";
import type { VideoRecord } from "./videos/video.model.js";
import type { VideoRepository } from "./videos/video.service.js";

export async function buildServer(config: AppConfig, videoRepo: VideoRepository = createMemoryVideoRepository()) {
  const server = Fastify({ logger: true });
  await server.register(cors, { origin: true });
  await server.register(rateLimit, { global: false });
  await server.register(sensible);

  server.get("/healthz", async () => ({ ok: true }));
  await registerAuthRoutes(server, config);
  await registerVideoRoutes(server, config, videoRepo);

  return server;
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
    deleteVideo: async (videoId) => {
      videos.delete(videoId);
    },
    deletePrefix: async () => undefined
  };
}

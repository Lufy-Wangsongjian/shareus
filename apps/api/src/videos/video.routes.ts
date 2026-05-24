import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyAdminToken } from "../auth/tokens.js";
import type { AppConfig } from "../config.js";
import { createVideoService, type VideoRepository } from "./video.service.js";

const importVideoSchema = z.object({
  title: z.string().min(1),
  sourceObjectPath: z.string().min(1)
});

export async function registerVideoRoutes(
  server: FastifyInstance,
  config: AppConfig,
  repo: VideoRepository
): Promise<void> {
  const videos = createVideoService(repo);

  async function requireAdmin(request: { headers: Record<string, unknown> }) {
    const header = String(request.headers.authorization ?? "");
    const token = header.replace(/^Bearer\s+/i, "");
    await verifyAdminToken({ token, secret: config.adminTokenSecret });
  }

  server.get("/api/videos", async () => videos.listVideos());

  server.post("/api/videos/import", async (request, reply) => {
    await requireAdmin(request);
    const body = importVideoSchema.parse(request.body);
    try {
      return await videos.importVideo(body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Video import failed" });
    }
  });
}

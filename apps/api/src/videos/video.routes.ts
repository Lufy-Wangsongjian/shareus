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

  async function requireAdmin(request: { headers: Record<string, unknown> }): Promise<boolean> {
    const header = String(request.headers.authorization ?? "");
    const token = header.replace(/^Bearer\s+/i, "");
    try {
      await verifyAdminToken({ token, secret: config.adminTokenSecret });
      return true;
    } catch {
      return false;
    }
  }

  server.get("/api/videos", async (request, reply) => {
    if (!(await requireAdmin(request))) {
      return reply.code(401).send({ message: "Admin authorization is required" });
    }

    return videos.listVideos();
  });

  server.post("/api/videos/import", async (request, reply) => {
    if (!(await requireAdmin(request))) {
      return reply.code(401).send({ message: "Admin authorization is required" });
    }

    const parsed = importVideoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Video title and source object path are required" });
    }

    try {
      return await videos.importVideo(parsed.data);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Video import failed" });
    }
  });
}

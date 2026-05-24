import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { createTranscodeService, type TranscodeGateway } from "./transcode.service.js";

export async function registerTranscodeRoutes(
  server: FastifyInstance,
  config: AppConfig,
  gateway: TranscodeGateway
): Promise<void> {
  const service = createTranscodeService(gateway);

  server.post<{ Params: { videoId: string } }>("/api/videos/:videoId/transcode", async (request, reply) => {
    const token = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    try {
      await verifyAdminToken({ token, secret: config.adminTokenSecret });
    } catch {
      return reply.code(401).send({ message: "Admin authorization is required" });
    }

    try {
      await service.startTranscode({
        videoId: request.params.videoId,
        bucket: config.gcsBucket
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Transcode failed" });
    }

    return { ok: true };
  });
}

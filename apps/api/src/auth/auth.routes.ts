import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { createAdminToken } from "./tokens.js";

const loginSchema = z.object({
  password: z.string().min(1)
});

export async function registerAuthRoutes(server: FastifyInstance, config: AppConfig): Promise<void> {
  server.post("/api/auth/admin-login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    if (body.password !== config.adminPassword) {
      return reply.code(401).send({ message: "Invalid admin password" });
    }

    const token = await createAdminToken({
      secret: config.adminTokenSecret,
      ttlSec: 60 * 60 * 8
    });

    return { token };
  });
}

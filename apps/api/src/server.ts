import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/auth.routes.js";
import type { AppConfig } from "./config.js";

export async function buildServer(config: AppConfig) {
  const server = Fastify({ logger: true });
  await server.register(cors, { origin: true });
  await server.register(rateLimit, { global: false });
  await server.register(sensible);

  server.get("/healthz", async () => ({ ok: true }));
  await registerAuthRoutes(server, config);

  return server;
}

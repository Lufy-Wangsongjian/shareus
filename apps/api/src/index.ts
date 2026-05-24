import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const server = await buildServer(loadConfig());
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });

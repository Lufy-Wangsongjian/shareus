import "./loadEnv.js";
import { loadConfig } from "./config.js";
import { attachRoomSocket } from "./rooms/room.socket.js";
import { buildServer, createProductionDeps } from "./server.js";

const config = loadConfig();
const server = await buildServer(config, createProductionDeps(config));
attachRoomSocket(server.server);

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });

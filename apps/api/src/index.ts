import "./loadEnv.js";
import { loadConfig } from "./config.js";
import { createFirestoreAdapter } from "./firestore.js";
import { attachRoomSocket } from "./rooms/room.socket.js";
import { buildServer, createProductionDeps } from "./server.js";

const config = loadConfig();
const deps = createProductionDeps(config);
const firestore = createFirestoreAdapter();
const server = await buildServer(config, deps);

attachRoomSocket(server.server, deps.roomRepo ? {
  getRoomPlaybackState: async (roomId) => {
    const room = await deps.roomRepo!.getRoom(roomId);
    return room ? { videoId: room.videoId, playbackState: room.playbackState } : null;
  },
  savePlaybackState: async (roomId, playbackState) => {
    await deps.roomRepo!.updateRoom(roomId, {
      playbackState,
      updatedAt: new Date().toISOString()
    });
  },
  saveChatMessage: firestore.saveChatMessage,
  listChatMessages: firestore.listChatMessages
} : undefined);

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });

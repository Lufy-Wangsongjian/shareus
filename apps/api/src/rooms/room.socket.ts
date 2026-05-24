import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";

export const playbackSocketPayloadSchema = z.object({
  roomId: z.string().min(1),
  videoId: z.string().min(1),
  isPlaying: z.boolean(),
  positionSec: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1)
});

export function attachRoomSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: true }
  });

  io.on("connection", (socket) => {
    socket.on("room:join", ({ roomId }: { roomId: string }) => {
      socket.join(roomId);
    });

    socket.on("playback:update", (payload: unknown) => {
      const parsed = playbackSocketPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid playback payload" });
        return;
      }
      socket.to(parsed.data.roomId).emit("playback:remote-update", parsed.data);
    });

    socket.on("chat:message", (payload: { roomId: string; message: string }) => {
      socket.to(payload.roomId).emit("chat:message", {
        message: payload.message,
        sentAt: new Date().toISOString()
      });
    });
  });

  return io;
}

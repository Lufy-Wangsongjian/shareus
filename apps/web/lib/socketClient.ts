import { io } from "socket.io-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export function createRoomSocket(roomId: string, nickname: string) {
  const socket = io(apiBaseUrl, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000
  });
  socket.on("connect", () => socket.emit("room:join", { roomId, nickname }));
  return socket;
}

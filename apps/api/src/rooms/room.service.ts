import { createRoomId } from "@shareus/shared";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { RoomRecord } from "./room.model.js";

export interface RoomRepository {
  getVideo: (videoId: string) => Promise<{ id: string; status: string; title?: string } | null>;
  saveRoom: (room: RoomRecord) => Promise<RoomRecord>;
  getRoom: (roomId: string) => Promise<RoomRecord | null>;
  updateRoom: (roomId: string, patch: Partial<RoomRecord>) => Promise<void>;
  listOpenRooms: () => Promise<RoomRecord[]>;
}

export function createRoomService(repo: RoomRepository) {
  return {
    async createRoom(input: { videoId: string; password: string }): Promise<RoomRecord> {
      const video = await repo.getVideo(input.videoId);
      if (!video || video.status !== "ready") {
        throw new Error("Video is not ready");
      }

      const now = new Date().toISOString();
      return repo.saveRoom({
        id: createRoomId(),
        videoId: input.videoId,
        passwordHash: await hashPassword(input.password),
        status: "open",
        playbackState: null,
        createdAt: now,
        updatedAt: now
      });
    },
    async joinRoom(input: { roomId: string; password: string }): Promise<RoomRecord> {
      const room = await repo.getRoom(input.roomId);
      if (!room || room.status !== "open") {
        throw new Error("Room is not available");
      }
      if (!(await verifyPassword(room.passwordHash, input.password))) {
        throw new Error("Invalid room password");
      }
      return room;
    },
    async updatePlayback(roomId: string, playbackState: RoomRecord["playbackState"]): Promise<void> {
      await repo.updateRoom(roomId, {
        playbackState,
        updatedAt: new Date().toISOString()
      });
    }
  };
}

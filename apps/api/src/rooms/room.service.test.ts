import { describe, expect, it } from "vitest";
import { createRoomService } from "./room.service.js";

describe("room service", () => {
  it("creates a room for a ready video", async () => {
    const service = createRoomService({
      getVideo: async () => ({ id: "vid_1", status: "ready" }),
      saveRoom: async (room) => room,
      getRoom: async () => null,
      updateRoom: async () => undefined,
      listOpenRooms: async () => []
    });

    const room = await service.createRoom({ videoId: "vid_1", password: "room-secret" });

    expect(room).toMatchObject({
      videoId: "vid_1",
      status: "open",
      playbackState: null
    });
    expect(room.passwordHash).not.toBe("room-secret");
  });

  it("rejects rooms for videos that are not ready", async () => {
    const service = createRoomService({
      getVideo: async () => ({ id: "vid_1", status: "processing" }),
      saveRoom: async (room) => room,
      getRoom: async () => null,
      updateRoom: async () => undefined,
      listOpenRooms: async () => []
    });

    await expect(service.createRoom({ videoId: "vid_1", password: "room-secret" }))
      .rejects.toThrow("Video is not ready");
  });
});

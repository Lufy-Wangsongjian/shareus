import { describe, expect, it } from "vitest";
import { createRoomService } from "./room.service.js";

describe("room service", () => {
  const baseRepo = {
    saveRoom: async (room: import("./room.model.js").RoomRecord) => room,
    getRoom: async () => null,
    updateRoom: async () => undefined,
    listOpenRooms: async () => [],
    listAllRooms: async () => [],
    deleteRoom: async () => undefined,
    saveWatchLog: async (entry: import("./watchLog.model.js").WatchLogRecord) => entry,
    listWatchLogs: async () => []
  };

  it("creates a room for a ready video", async () => {
    const service = createRoomService({
      ...baseRepo,
      getVideo: async () => ({ id: "vid_1", status: "ready" })
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
      ...baseRepo,
      getVideo: async () => ({ id: "vid_1", status: "processing" })
    });

    await expect(service.createRoom({ videoId: "vid_1", password: "room-secret" }))
      .rejects.toThrow("Video is not ready");
  });
});

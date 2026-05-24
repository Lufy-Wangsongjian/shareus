import { describe, expect, it } from "vitest";
import { playbackSocketPayloadSchema } from "./room.socket.js";

describe("playback socket payload", () => {
  it("accepts valid playback updates", () => {
    const result = playbackSocketPayloadSchema.safeParse({
      roomId: "room_abc",
      videoId: "vid_1",
      isPlaying: true,
      positionSec: 12.5,
      updatedAt: "2026-05-24T12:00:00.000Z",
      updatedBy: "socket-1"
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid playback updates", () => {
    const result = playbackSocketPayloadSchema.safeParse({
      roomId: "room_abc",
      isPlaying: true
    });

    expect(result.success).toBe(false);
  });
});

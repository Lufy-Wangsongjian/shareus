import { describe, expect, it } from "vitest";
import { createVideoService } from "./video.service.js";

describe("video service", () => {
  it("imports a valid upload object as an imported video", async () => {
    const writes: unknown[] = [];
    const service = createVideoService({
      objectExists: async () => true,
      saveVideo: async (video) => {
        writes.push(video);
        return video;
      },
      listVideos: async () => [],
      deleteVideo: async () => undefined,
      deletePrefix: async () => undefined
    });

    const video = await service.importVideo({ title: "Movie", sourceObjectPath: "uploads/movie.mp4" });

    expect(video).toMatchObject({
      title: "Movie",
      sourceObjectPath: "uploads/movie.mp4",
      status: "imported"
    });
    expect(writes).toHaveLength(1);
  });

  it("rejects a missing GCS object", async () => {
    const service = createVideoService({
      objectExists: async () => false,
      saveVideo: async (video) => video,
      listVideos: async () => [],
      deleteVideo: async () => undefined,
      deletePrefix: async () => undefined
    });

    await expect(service.importVideo({ title: "Movie", sourceObjectPath: "uploads/missing.mp4" }))
      .rejects.toThrow("Source object does not exist");
  });
});

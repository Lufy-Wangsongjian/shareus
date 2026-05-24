import { describe, expect, it } from "vitest";
import { createTranscodeService } from "./transcode.service.js";

describe("transcode service", () => {
  it("starts a job with the video environment", async () => {
    const calls: unknown[] = [];
    const service = createTranscodeService({
      startJob: async (env) => {
        calls.push(env);
      },
      getVideo: async () => ({ id: "vid_1", sourceObjectPath: "uploads/movie.mp4", status: "imported" }),
      markProcessing: async () => undefined,
      markFailed: async () => undefined
    });

    await service.startTranscode({
      videoId: "vid_1",
      bucket: "bucket-name"
    });

    expect(calls).toEqual([{
      VIDEO_ID: "vid_1",
      SOURCE_OBJECT_PATH: "uploads/movie.mp4",
      GCS_BUCKET: "bucket-name"
    }]);
  });
});

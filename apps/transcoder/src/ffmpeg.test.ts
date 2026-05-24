import { describe, expect, it } from "vitest";
import { buildHlsCommandArgs } from "./ffmpeg.js";

describe("buildHlsCommandArgs", () => {
  it("builds a single-rendition HLS command", () => {
    expect(buildHlsCommandArgs({
      inputPath: "/tmp/input.mp4",
      outputPlaylistPath: "/tmp/hls/index.m3u8"
    })).toEqual([
      "-y",
      "-i", "/tmp/input.mp4",
      "-c:v", "h264",
      "-c:a", "aac",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", "/tmp/hls/segment-%05d.ts",
      "/tmp/hls/index.m3u8"
    ]);
  });
});

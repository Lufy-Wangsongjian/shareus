import { describe, expect, it } from "vitest";
import { rewritePlaylistWithSignedSegments } from "./playlist.js";

describe("rewritePlaylistWithSignedSegments", () => {
  it("rewrites relative segment paths to signed URLs", async () => {
    const playlist = "#EXTM3U\n#EXTINF:4.0,\nseg-000.ts\n#EXTINF:4.0,\nnested/seg-001.ts\n";
    const rewritten = await rewritePlaylistWithSignedSegments({
      playlist,
      hlsPrefix: "videos/vid_1/hls",
      signSegment: async (objectPath) => `https://signed.example/${objectPath}`
    });

    expect(rewritten).toContain("https://signed.example/videos/vid_1/hls/seg-000.ts");
    expect(rewritten).toContain("https://signed.example/videos/vid_1/hls/nested/seg-001.ts");
    expect(rewritten).toContain("#EXTM3U");
  });

  it("rejects segment paths that would escape the HLS prefix", async () => {
    const playlist = "#EXTM3U\n#EXTINF:4.0,\n../secret.ts\n";

    await expect(rewritePlaylistWithSignedSegments({
      playlist,
      hlsPrefix: "videos/vid_1/hls",
      signSegment: async (objectPath) => `https://signed.example/${objectPath}`
    })).rejects.toThrow("Invalid HLS segment path");
  });

  it("rewrites URI attributes for supported HLS tags", async () => {
    const playlist = "#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:4.0,\nseg-000.ts\n";
    const rewritten = await rewritePlaylistWithSignedSegments({
      playlist,
      hlsPrefix: "videos/vid_1/hls",
      signSegment: async (objectPath) => `https://signed.example/${objectPath}`
    });

    expect(rewritten).toContain("#EXT-X-MAP:URI=\"https://signed.example/videos/vid_1/hls/init.mp4\"");
  });
});

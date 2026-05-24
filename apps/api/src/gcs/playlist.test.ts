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
});

export interface BuildHlsCommandInput {
  inputPath: string;
  outputPlaylistPath: string;
}

export function buildHlsCommandArgs(input: BuildHlsCommandInput): string[] {
  const outputDir = input.outputPlaylistPath.replace(/\/index\.m3u8$/, "");
  return [
    "-y",
    "-i", input.inputPath,
    "-c:v", "h264",
    "-c:a", "aac",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", `${outputDir}/segment-%05d.ts`,
    input.outputPlaylistPath
  ];
}

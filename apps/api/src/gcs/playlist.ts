export interface RewritePlaylistInput {
  playlist: string;
  hlsPrefix: string;
  signSegment: (objectPath: string) => Promise<string>;
}

export async function rewritePlaylistWithSignedSegments(input: RewritePlaylistInput): Promise<string> {
  const lines = input.playlist.split("\n");
  const rewrittenLines = await Promise.all(lines.map(async (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^https?:\/\//.test(trimmed)) {
      return line;
    }

    const objectPath = `${input.hlsPrefix.replace(/\/$/, "")}/${trimmed.replace(/^\//, "")}`;
    return input.signSegment(objectPath);
  }));

  return rewrittenLines.join("\n");
}

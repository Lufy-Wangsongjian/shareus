export interface RewritePlaylistInput {
  playlist: string;
  hlsPrefix: string;
  signSegment: (objectPath: string) => Promise<string>;
}

export async function rewritePlaylistWithSignedSegments(input: RewritePlaylistInput): Promise<string> {
  const lines = input.playlist.split("\n");
  const rewrittenLines = await Promise.all(lines.map(async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return line;
    }

    if (trimmed.startsWith("#")) {
      return rewriteUriAttribute(line, input);
    }

    if (/^https?:\/\//.test(trimmed)) {
      return line;
    }

    return input.signSegment(toSegmentObjectPath(input.hlsPrefix, trimmed));
  }));

  return rewrittenLines.join("\n");
}

async function rewriteUriAttribute(line: string, input: RewritePlaylistInput): Promise<string> {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (!uriMatch?.[1]) {
    return line;
  }

  const uri = uriMatch[1];
  if (/^https?:\/\//.test(uri)) {
    return line;
  }

  const signedUrl = await input.signSegment(toSegmentObjectPath(input.hlsPrefix, uri));
  return line.replace(`URI="${uri}"`, `URI="${signedUrl}"`);
}

function toSegmentObjectPath(hlsPrefix: string, segmentPath: string): string {
  if (segmentPath.startsWith("/") || segmentPath.includes("..")) {
    throw new Error("Invalid HLS segment path");
  }

  const cleanPrefix = hlsPrefix.replace(/\/$/, "");
  const cleanSegment = segmentPath.replace(/^\.\//, "");
  if (!cleanSegment || cleanSegment.startsWith("/") || cleanSegment.includes("..")) {
    throw new Error("Invalid HLS segment path");
  }

  return `${cleanPrefix}/${cleanSegment}`;
}

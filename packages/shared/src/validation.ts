const supportedExtensions = new Set(["mp4", "mov", "mkv"]);

export interface ParsedUploadObjectPath {
  objectPath: string;
  extension: "mp4" | "mov" | "mkv";
}

export function parseUploadObjectPath(objectPath: string): ParsedUploadObjectPath {
  const trimmed = objectPath.trim();
  if (!trimmed.startsWith("uploads/")) {
    throw new Error("Source object must be under uploads/");
  }

  const extension = trimmed.split(".").pop()?.toLowerCase();
  if (!extension || !supportedExtensions.has(extension)) {
    throw new Error("Supported source formats are mp4, mov, and mkv");
  }

  return {
    objectPath: trimmed,
    extension: extension as ParsedUploadObjectPath["extension"]
  };
}

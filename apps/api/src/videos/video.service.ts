import { createVideoId, parseUploadObjectPath } from "@shareus/shared";
import type { VideoRecord } from "./video.model.js";

export interface VideoRepository {
  objectExists: (objectPath: string) => Promise<boolean>;
  saveVideo: (video: VideoRecord) => Promise<VideoRecord>;
  listVideos: () => Promise<VideoRecord[]>;
  deleteVideo: (videoId: string) => Promise<void>;
  deletePrefix: (prefix: string) => Promise<void>;
}

export function createVideoService(repo: VideoRepository) {
  return {
    async importVideo(input: { title: string; sourceObjectPath: string }): Promise<VideoRecord> {
      const parsed = parseUploadObjectPath(input.sourceObjectPath);
      const exists = await repo.objectExists(parsed.objectPath);
      if (!exists) {
        throw new Error("Source object does not exist");
      }

      const now = new Date().toISOString();
      const id = createVideoId();
      return repo.saveVideo({
        id,
        title: input.title.trim(),
        sourceObjectPath: parsed.objectPath,
        status: "imported",
        hlsPrefix: null,
        durationSec: null,
        failureMessage: null,
        createdAt: now,
        updatedAt: now
      });
    },
    listVideos: repo.listVideos,
    async deleteVideo(video: VideoRecord): Promise<void> {
      if (video.hlsPrefix) {
        await repo.deletePrefix(video.hlsPrefix);
      }
      await repo.deleteVideo(video.id);
    }
  };
}

export interface TranscodeGateway {
  startJob: (env: Record<string, string>) => Promise<void>;
  getVideo: (videoId: string) => Promise<{ id: string; sourceObjectPath: string; status: string } | null>;
  markProcessing: (videoId: string) => Promise<void>;
  markFailed: (videoId: string, message: string) => Promise<void>;
}

const RETRYABLE_STATUSES = new Set(["imported", "failed", "processing"]);

export function createTranscodeService(gateway: TranscodeGateway) {
  return {
    async startTranscode(input: { videoId: string; bucket: string }): Promise<void> {
      const video = await gateway.getVideo(input.videoId);
      if (!video) {
        throw new Error("Video not found");
      }
      if (!RETRYABLE_STATUSES.has(video.status)) {
        throw new Error("Video is not ready for transcode");
      }

      await gateway.markProcessing(input.videoId);

      try {
        await gateway.startJob({
          VIDEO_ID: input.videoId,
          SOURCE_OBJECT_PATH: video.sourceObjectPath,
          GCS_BUCKET: input.bucket
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcode failed";
        await gateway.markFailed(input.videoId, message);
        throw error;
      }
    }
  };
}

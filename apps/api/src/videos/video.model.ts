import type { VideoStatus } from "@shareus/shared";

export interface VideoRecord {
  id: string;
  title: string;
  sourceObjectPath: string;
  status: VideoStatus;
  hlsPrefix: string | null;
  durationSec: number | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

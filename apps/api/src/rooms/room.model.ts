import type { PlaybackState } from "@shareus/shared";

export interface RoomRecord {
  id: string;
  videoId: string;
  passwordHash: string;
  status: "open" | "closed";
  playbackState: PlaybackState | null;
  createdAt: string;
  updatedAt: string;
}

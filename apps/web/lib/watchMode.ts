export type WatchMode = "sync" | "free";

export interface PeerProgressView {
  socketId: string;
  nickname: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: string;
  isBuffering?: boolean;
}

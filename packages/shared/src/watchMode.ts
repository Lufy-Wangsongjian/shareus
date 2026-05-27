export type WatchMode = "sync" | "free";

export const WATCH_MODE_CONTROLLER_NICKNAME = "lufy";

export function canControlWatchMode(nickname: string): boolean {
  return nickname.trim().toLowerCase() === WATCH_MODE_CONTROLLER_NICKNAME;
}

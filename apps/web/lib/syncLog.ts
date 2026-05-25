export interface SyncLogEntry {
  id: string;
  time: string;
  message: string;
}

export function createSyncLogEntry(message: string): SyncLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    message
  };
}

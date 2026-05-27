const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function adminLogin(password: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/admin-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Admin login failed");
  const data = await response.json() as { token: string };
  return data.token;
}

export async function listVideos(token: string) {
  const response = await fetch(`${apiBaseUrl}/api/videos`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to load videos");
  return response.json();
}

export async function importVideo(token: string, input: { title: string; sourceObjectPath: string }) {
  const response = await fetch(`${apiBaseUrl}/api/videos/import`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to import video");
  return response.json();
}

export async function startTranscode(token: string, videoId: string) {
  const response = await fetch(`${apiBaseUrl}/api/videos/${videoId}/transcode`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to start transcode"));
  return response.json();
}

export async function createRoom(token: string, input: { videoId: string; password: string }) {
  const response = await fetch(`${apiBaseUrl}/api/rooms`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to create room");
  return response.json() as Promise<{ id: string }>;
}

export async function joinRoom(roomId: string, password: string) {
  const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Failed to join room");
  return response.json() as Promise<{
    roomId: string;
    videoId: string;
    playbackState: {
      videoId: string;
      isPlaying: boolean;
      positionSec: number;
      updatedAt: string;
      updatedBy: string;
    } | null;
  }>;
}

export async function deleteVideo(token: string, videoId: string) {
  const response = await fetch(`${apiBaseUrl}/api/videos/${videoId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to delete video");
  return response.json();
}

export interface AdminRoomSummary {
  id: string;
  videoId: string;
  videoTitle: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  playbackState: {
    isPlaying: boolean;
    positionSec: number;
    updatedAt: string;
    updatedBy: string;
  } | null;
  latestLog: {
    message: string;
    createdAt: string;
    nickname?: string;
  } | null;
}

export interface WatchLogRecord {
  id: string;
  roomId: string;
  message: string;
  nickname?: string;
  createdAt: string;
}

export interface AdminRoomDetail extends Omit<AdminRoomSummary, "latestLog"> {
  watchLogs: WatchLogRecord[];
}

export async function listAdminRooms(token: string): Promise<AdminRoomSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/admin/rooms`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to load rooms"));
  return response.json();
}

export async function getAdminRoom(token: string, roomId: string): Promise<AdminRoomDetail> {
  const response = await fetch(`${apiBaseUrl}/api/admin/rooms/${roomId}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to load room"));
  return response.json();
}

export async function deleteAdminRoom(token: string, roomId: string): Promise<{ ok: boolean; roomId: string }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/rooms/${roomId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to delete room"));
  return response.json();
}

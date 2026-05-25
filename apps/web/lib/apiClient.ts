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

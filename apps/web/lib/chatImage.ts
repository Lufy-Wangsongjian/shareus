const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export function chatImageUrl(roomId: string, imageObjectPath: string): string {
  const filename = imageObjectPath.split("/").pop() ?? imageObjectPath;
  return `${apiBaseUrl}/api/rooms/${roomId}/chat-images/${filename}`;
}

export async function uploadChatImage(
  roomId: string,
  password: string,
  blob: Blob
): Promise<{ imageObjectPath: string }> {
  const contentType = blob.type === "image/png"
    || blob.type === "image/webp"
    || blob.type === "image/gif"
    ? blob.type
    : "image/jpeg";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  const dataBase64 = btoa(binary);

  const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/chat-images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password, contentType, dataBase64 })
  });

  if (!response.ok) {
    throw new Error("图片上传失败");
  }

  return response.json() as Promise<{ imageObjectPath: string }>;
}

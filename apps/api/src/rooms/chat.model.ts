export type ChatMessageType = "text" | "image" | "ai";

export interface ChatMessageRecord {
  id: string;
  roomId: string;
  nickname: string;
  message: string;
  sentAt: string;
  type?: ChatMessageType;
  imageObjectPath?: string;
}

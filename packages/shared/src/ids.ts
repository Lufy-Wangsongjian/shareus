import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const makeId = customAlphabet(alphabet, 16);

export function createVideoId(): string {
  return `vid_${makeId()}`;
}

export function createRoomId(): string {
  return `room_${makeId()}`;
}

export function createChatMessageId(): string {
  return `msg_${makeId()}`;
}

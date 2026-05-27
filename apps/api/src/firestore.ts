import { Firestore } from "@google-cloud/firestore";
import type { ChatMessageRecord } from "./rooms/chat.model.js";
import type { RoomRecord } from "./rooms/room.model.js";
import type { WatchLogRecord } from "./rooms/watchLog.model.js";
import type { VideoRecord } from "./videos/video.model.js";

export function createFirestoreAdapter() {
  const db = new Firestore();

  return {
    async saveVideo(video: VideoRecord): Promise<VideoRecord> {
      await db.collection("videos").doc(video.id).set(video);
      return video;
    },
    async listVideos(): Promise<VideoRecord[]> {
      const snap = await db.collection("videos").orderBy("createdAt", "desc").get();
      return snap.docs.map((doc) => doc.data() as VideoRecord);
    },
    async getVideo(videoId: string): Promise<VideoRecord | null> {
      const doc = await db.collection("videos").doc(videoId).get();
      return doc.exists ? doc.data() as VideoRecord : null;
    },
    async updateVideo(videoId: string, patch: Partial<VideoRecord>): Promise<VideoRecord | null> {
      const ref = db.collection("videos").doc(videoId);
      if (Object.keys(patch).length > 0) {
        await ref.update(patch);
      }
      const doc = await ref.get();
      return doc.exists ? doc.data() as VideoRecord : null;
    },
    async deleteVideo(videoId: string): Promise<void> {
      await db.collection("videos").doc(videoId).delete();
    },
    async saveRoom(room: RoomRecord): Promise<RoomRecord> {
      await db.collection("rooms").doc(room.id).set(room);
      return room;
    },
    async getRoom(roomId: string): Promise<RoomRecord | null> {
      const doc = await db.collection("rooms").doc(roomId).get();
      return doc.exists ? doc.data() as RoomRecord : null;
    },
    async updateRoom(roomId: string, patch: Partial<RoomRecord>): Promise<void> {
      await db.collection("rooms").doc(roomId).update(patch);
    },
    async listOpenRooms(): Promise<RoomRecord[]> {
      const snap = await db.collection("rooms").orderBy("createdAt", "desc").get();
      return snap.docs
        .map((doc) => doc.data() as RoomRecord)
        .filter((room) => room.status === "open");
    },
    async listAllRooms(): Promise<RoomRecord[]> {
      const snap = await db.collection("rooms").orderBy("createdAt", "desc").get();
      return snap.docs.map((doc) => doc.data() as RoomRecord);
    },
    async deleteRoom(roomId: string): Promise<void> {
      const roomRef = db.collection("rooms").doc(roomId);
      const [messageDocs, watchLogDocs] = await Promise.all([
        roomRef.collection("messages").listDocuments(),
        roomRef.collection("watchLogs").listDocuments()
      ]);

      const batch = db.batch();
      for (const doc of [...messageDocs, ...watchLogDocs]) {
        batch.delete(doc);
      }
      batch.delete(roomRef);
      await batch.commit();
    },
    async saveWatchLog(entry: WatchLogRecord): Promise<WatchLogRecord> {
      await db
        .collection("rooms")
        .doc(entry.roomId)
        .collection("watchLogs")
        .doc(entry.id)
        .set(entry);
      return entry;
    },
    async listWatchLogs(roomId: string, limit = 200): Promise<WatchLogRecord[]> {
      const snap = await db
        .collection("rooms")
        .doc(roomId)
        .collection("watchLogs")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => doc.data() as WatchLogRecord);
    },
    async saveChatMessage(message: ChatMessageRecord): Promise<ChatMessageRecord> {
      await db
        .collection("rooms")
        .doc(message.roomId)
        .collection("messages")
        .doc(message.id)
        .set(message);
      return message;
    },
    async listChatMessages(roomId: string, limit = 200): Promise<ChatMessageRecord[]> {
      const snap = await db
        .collection("rooms")
        .doc(roomId)
        .collection("messages")
        .orderBy("sentAt", "asc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => doc.data() as ChatMessageRecord);
    }
  };
}

export type FirestoreAdapter = ReturnType<typeof createFirestoreAdapter>;

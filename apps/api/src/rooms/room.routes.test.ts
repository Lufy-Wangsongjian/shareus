import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";

describe("room routes", () => {
  const testConfig = {
    adminPassword: "secret",
    adminTokenSecret: "test-admin-token-secret-32-bytes-long",
    roomTokenSecret: "test-room-token-secret-32-bytes-long",
    gcpProjectId: "test-project",
    gcsBucket: "test-bucket",
    transcoderJobName: "test-job",
    transcoderRegion: "asia-east1"
  };

  it("lists open rooms with video titles", async () => {
    const server = await buildServer(testConfig, {
      roomRepo: {
        listOpenRooms: async () => [{
          id: "room_abc",
          videoId: "vid_1",
          passwordHash: "hash",
          status: "open",
          playbackState: null,
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "2026-05-24T12:00:00.000Z"
        }],
        listAllRooms: async () => [{
          id: "room_abc",
          videoId: "vid_1",
          passwordHash: "hash",
          status: "open",
          playbackState: null,
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "2026-05-24T12:00:00.000Z"
        }],
        deleteRoom: async () => undefined,
        saveWatchLog: async (entry) => entry,
        listWatchLogs: async () => [],
        getVideo: async () => ({ id: "vid_1", status: "ready", title: "测试电影" }),
        saveRoom: async (room) => room,
        getRoom: async () => null,
        updateRoom: async () => undefined
      }
    });

    const response = await server.inject({ method: "GET", url: "/api/rooms" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{
      id: "room_abc",
      videoId: "vid_1",
      videoTitle: "测试电影",
      status: "open",
      createdAt: "2026-05-24T12:00:00.000Z"
    }]);
  });
});

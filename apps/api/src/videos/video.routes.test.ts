import { createAdminToken } from "../auth/tokens.js";
import { buildServer } from "../server.js";
import type { VideoRepository } from "./video.service.js";
import { describe, expect, it } from "vitest";

const testConfig = {
  adminPassword: "secret",
  adminTokenSecret: "test-admin-token-secret-32-bytes-long",
  roomTokenSecret: "test-room-token-secret-32-bytes-long",
  gcpProjectId: "test-project",
  gcsBucket: "test-bucket",
  transcoderJobName: "test-job",
  transcoderRegion: "asia-east1"
};

function createRepo(overrides: Partial<VideoRepository> = {}): VideoRepository {
  return {
    objectExists: async () => true,
    saveVideo: async (video) => video,
    listVideos: async () => [],
    deleteVideo: async () => undefined,
    deletePrefix: async () => undefined,
    ...overrides
  };
}

describe("video routes", () => {
  it("requires admin auth to list videos", async () => {
    const server = await buildServer(testConfig, createRepo());

    const response = await server.inject({
      method: "GET",
      url: "/api/videos"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Admin authorization is required" });
  });

  it("lists videos with admin auth", async () => {
    const token = await createAdminToken({ secret: testConfig.adminTokenSecret, ttlSec: 60 });
    const server = await buildServer(testConfig, createRepo({
      listVideos: async () => [{
        id: "vid_1",
        title: "Movie",
        sourceObjectPath: "uploads/movie.mp4",
        status: "imported",
        hlsPrefix: null,
        durationSec: null,
        failureMessage: null,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z"
      }]
    }));

    const response = await server.inject({
      method: "GET",
      url: "/api/videos",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ id: "vid_1", title: "Movie" }]);
  });

  it("returns bad request for invalid import payloads", async () => {
    const token = await createAdminToken({ secret: testConfig.adminTokenSecret, ttlSec: 60 });
    const server = await buildServer(testConfig, createRepo());

    const response = await server.inject({
      method: "POST",
      url: "/api/videos/import",
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Video title and source object path are required" });
  });

  it("returns unauthorized for missing import auth", async () => {
    const server = await buildServer(testConfig, createRepo());

    const response = await server.inject({
      method: "POST",
      url: "/api/videos/import",
      payload: { title: "Movie", sourceObjectPath: "uploads/movie.mp4" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Admin authorization is required" });
  });
});

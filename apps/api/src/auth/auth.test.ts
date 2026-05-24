import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAdminToken, verifyAdminToken } from "./tokens.js";

describe("password helpers", () => {
  it("verifies a matching password and rejects a mismatch", async () => {
    const hash = await hashPassword("secret");
    await expect(verifyPassword(hash, "secret")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong")).resolves.toBe(false);
  });
});

describe("admin tokens", () => {
  it("creates and verifies an admin token", async () => {
    const token = await createAdminToken({ secret: "test-secret", ttlSec: 60 });
    expect(await verifyAdminToken({ token, secret: "test-secret" })).toEqual({ role: "admin" });
  });

  it("rejects malformed and tampered admin tokens consistently", async () => {
    const token = await createAdminToken({ secret: "test-secret", ttlSec: 60 });

    await expect(verifyAdminToken({ token: `${token}.extra`, secret: "test-secret" })).rejects.toThrow("Invalid token");
    await expect(verifyAdminToken({ token: "payload.short", secret: "test-secret" })).rejects.toThrow("Invalid token");
    await expect(verifyAdminToken({ token, secret: "wrong-secret" })).rejects.toThrow("Invalid token");
  });

  it("rejects expired admin tokens", async () => {
    const token = await createAdminToken({ secret: "test-secret", ttlSec: -1 });

    await expect(verifyAdminToken({ token, secret: "test-secret" })).rejects.toThrow("Invalid token");
  });
});

describe("auth routes", () => {
  const testConfig = {
    adminPassword: "secret",
    adminTokenSecret: "test-admin-token-secret-32-bytes-long",
    roomTokenSecret: "test-room-token-secret-32-bytes-long",
    gcpProjectId: "test-project",
    gcsBucket: "test-bucket",
    transcoderJobName: "test-job",
    transcoderRegion: "asia-east1"
  };

  it("returns an admin token for the configured password", async () => {
    const server = await buildServer(testConfig);

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/admin-login",
      payload: { password: "secret" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: expect.any(String) });
  });

  it("returns unauthorized for an incorrect admin password", async () => {
    const server = await buildServer(testConfig);

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/admin-login",
      payload: { password: "wrong" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Invalid admin password" });
  });

  it("returns bad request for malformed login bodies", async () => {
    const server = await buildServer(testConfig);

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/admin-login",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Password is required" });
  });

  it("rate limits repeated admin login attempts", async () => {
    const server = await buildServer(testConfig);

    for (let index = 0; index < 20; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/admin-login",
        payload: { password: "wrong" }
      });
      expect(response.statusCode).toBe(401);
    }

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/admin-login",
      payload: { password: "wrong" }
    });

    expect(response.statusCode).toBe(429);
  });
});

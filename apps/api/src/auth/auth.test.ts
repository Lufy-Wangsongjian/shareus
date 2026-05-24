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
});

describe("auth routes", () => {
  it("returns an admin token for the configured password", async () => {
    const server = await buildServer({
      adminPassword: "secret",
      adminTokenSecret: "token-secret",
      roomTokenSecret: "room-secret",
      gcpProjectId: "test-project",
      gcsBucket: "test-bucket",
      transcoderJobName: "test-job",
      transcoderRegion: "asia-east1"
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/admin-login",
      payload: { password: "secret" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: expect.any(String) });
  });
});

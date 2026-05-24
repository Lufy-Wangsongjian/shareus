# Private Watch Party Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private two-person watch party web app that imports manually uploaded GCS videos, transcodes them to HLS, and synchronizes playback in private rooms.

**Architecture:** Use a TypeScript monorepo with a Next.js frontend, Fastify API, Socket.IO realtime server, shared domain package, and a containerized ffmpeg transcode worker. Google Cloud Storage stores source and HLS assets, Firestore stores metadata and room state, and Cloud Run hosts the web/API service plus transcode job.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js, Tailwind CSS, Fastify, Socket.IO, Vitest, Playwright, Firebase Admin SDK, Google Cloud Storage SDK, Google Cloud Run Jobs API, Docker, ffmpeg.

---

## File Structure

Create this structure:

```text
apps/web/
  app/
    admin/page.tsx
    room/[roomId]/page.tsx
    page.tsx
  components/
    AdminLogin.tsx
    ChatPanel.tsx
    HlsPlayer.tsx
    RoomControls.tsx
    VideoLibrary.tsx
  lib/
    apiClient.ts
    socketClient.ts
  tests/
    admin-page.test.tsx
    hls-player.test.tsx
    room-page.test.tsx
apps/api/
  src/
    config.ts
    index.ts
    server.ts
    auth/
      password.ts
      tokens.ts
      auth.routes.ts
      auth.test.ts
    gcs/
      storage.ts
      playlist.ts
      playlist.test.ts
    rooms/
      room.model.ts
      room.service.ts
      room.routes.ts
      room.socket.ts
      room.service.test.ts
      room.socket.test.ts
    transcode/
      transcode.routes.ts
      transcode.service.ts
      transcode.service.test.ts
    videos/
      video.model.ts
      video.service.ts
      video.routes.ts
      video.service.test.ts
  tests/
    api.integration.test.ts
apps/transcoder/
  Dockerfile
  src/
    index.ts
    ffmpeg.ts
    ffmpeg.test.ts
packages/shared/
  src/
    ids.ts
    playback.ts
    playback.test.ts
    schemas.ts
    validation.ts
    validation.test.ts
infra/
  cloudrun.service.yaml
  cloudrun.transcoder-job.yaml
  firestore.indexes.json
  gcs-cors.json
docs/
  local-development.md
  deployment.md
```

Responsibilities:

- `packages/shared`: pure validation, ids, shared types, and playback drift math. No cloud or framework imports.
- `apps/api/src/auth`: admin and room password hashing plus short-lived admin tokens.
- `apps/api/src/videos`: video metadata, GCS source validation, delete behavior.
- `apps/api/src/gcs`: GCS object checks and HLS playlist rewriting.
- `apps/api/src/transcode`: Cloud Run Job invocation and transcode status updates.
- `apps/api/src/rooms`: room lifecycle, password join, playback state, chat and Socket.IO events.
- `apps/web`: responsive admin and watch-room UI.
- `apps/transcoder`: ffmpeg worker run as a Cloud Run Job.
- `infra`: deployment examples, not secrets.

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create root package metadata**

Create `package.json`:

```json
{
  "name": "shareus-watch-party",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @shareus/api --filter @shareus/web dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  },
  "packageManager": "pnpm@9.1.0"
}
```

- [ ] **Step 2: Create workspace and TypeScript config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Create `.gitignore`:

```gitignore
node_modules
.next
dist
coverage
.env
.env.local
*.log
.DS_Store
```

Create `.env.example`:

```dotenv
GCP_PROJECT_ID=your-project-id
GCS_BUCKET=your-private-video-bucket
ADMIN_PASSWORD=change-me
ADMIN_TOKEN_SECRET=replace-with-random-32-byte-secret
ROOM_TOKEN_SECRET=replace-with-random-32-byte-secret
TRANSCODER_JOB_NAME=shareus-transcoder
TRANSCODER_REGION=asia-east1
```

- [ ] **Step 3: Create shared package shell**

Create `packages/shared/package.json`:

```json
{
  "name": "@shareus/shared",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "nanoid": "^5.0.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/shared/src/ids.ts`:

```ts
import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const makeId = customAlphabet(alphabet, 16);

export function createVideoId(): string {
  return `vid_${makeId()}`;
}

export function createRoomId(): string {
  return `room_${makeId()}`;
}
```

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from "zod";

export const videoStatusSchema = z.enum(["imported", "processing", "ready", "failed"]);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const playbackStateSchema = z.object({
  videoId: z.string().min(1),
  isPlaying: z.boolean(),
  positionSec: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1)
});
export type PlaybackState = z.infer<typeof playbackStateSchema>;
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./ids.js";
export * from "./schemas.js";
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
pnpm install
```

Expected: lockfile is created and install exits with code 0.

- [ ] **Step 5: Verify scaffold**

Run:

```bash
pnpm typecheck
```

Expected: shared package typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .gitignore .env.example packages/shared
git commit -m "chore: scaffold TypeScript monorepo"
```

## Task 2: Shared Validation and Playback Math

**Files:**
- Create: `packages/shared/src/validation.ts`
- Create: `packages/shared/src/validation.test.ts`
- Create: `packages/shared/src/playback.ts`
- Create: `packages/shared/src/playback.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write validation tests**

Create `packages/shared/src/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseUploadObjectPath } from "./validation.js";

describe("parseUploadObjectPath", () => {
  it("accepts supported source objects under uploads", () => {
    expect(parseUploadObjectPath("uploads/movie.mp4")).toEqual({
      objectPath: "uploads/movie.mp4",
      extension: "mp4"
    });
    expect(parseUploadObjectPath("uploads/folder/movie.mkv")).toEqual({
      objectPath: "uploads/folder/movie.mkv",
      extension: "mkv"
    });
  });

  it("rejects objects outside uploads", () => {
    expect(() => parseUploadObjectPath("videos/movie.mp4")).toThrow("Source object must be under uploads/");
  });

  it("rejects unsupported extensions", () => {
    expect(() => parseUploadObjectPath("uploads/movie.avi")).toThrow("Supported source formats are mp4, mov, and mkv");
  });
});
```

- [ ] **Step 2: Write playback tests**

Create `packages/shared/src/playback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateExpectedPosition, shouldCorrectDrift } from "./playback.js";

describe("calculateExpectedPosition", () => {
  it("keeps paused position fixed", () => {
    expect(calculateExpectedPosition({
      isPlaying: false,
      positionSec: 12,
      updatedAtMs: 1_000,
      nowMs: 5_000
    })).toBe(12);
  });

  it("advances playing position by elapsed time", () => {
    expect(calculateExpectedPosition({
      isPlaying: true,
      positionSec: 12,
      updatedAtMs: 1_000,
      nowMs: 5_500
    })).toBe(16.5);
  });
});

describe("shouldCorrectDrift", () => {
  it("ignores tiny drift", () => {
    expect(shouldCorrectDrift({ localPositionSec: 10, expectedPositionSec: 10.25 })).toBe(false);
  });

  it("corrects large drift", () => {
    expect(shouldCorrectDrift({ localPositionSec: 10, expectedPositionSec: 12.1 })).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm --filter @shareus/shared test
```

Expected: fails because `validation.js` and `playback.js` do not exist.

- [ ] **Step 4: Implement validation and playback helpers**

Create `packages/shared/src/validation.ts`:

```ts
const supportedExtensions = new Set(["mp4", "mov", "mkv"]);

export interface ParsedUploadObjectPath {
  objectPath: string;
  extension: "mp4" | "mov" | "mkv";
}

export function parseUploadObjectPath(objectPath: string): ParsedUploadObjectPath {
  const trimmed = objectPath.trim();
  if (!trimmed.startsWith("uploads/")) {
    throw new Error("Source object must be under uploads/");
  }

  const extension = trimmed.split(".").pop()?.toLowerCase();
  if (!extension || !supportedExtensions.has(extension)) {
    throw new Error("Supported source formats are mp4, mov, and mkv");
  }

  return {
    objectPath: trimmed,
    extension: extension as ParsedUploadObjectPath["extension"]
  };
}
```

Create `packages/shared/src/playback.ts`:

```ts
export interface CalculateExpectedPositionInput {
  isPlaying: boolean;
  positionSec: number;
  updatedAtMs: number;
  nowMs: number;
}

export function calculateExpectedPosition(input: CalculateExpectedPositionInput): number {
  if (!input.isPlaying) {
    return input.positionSec;
  }

  const elapsedSec = Math.max(0, input.nowMs - input.updatedAtMs) / 1000;
  return input.positionSec + elapsedSec;
}

export interface ShouldCorrectDriftInput {
  localPositionSec: number;
  expectedPositionSec: number;
  thresholdSec?: number;
}

export function shouldCorrectDrift(input: ShouldCorrectDriftInput): boolean {
  const thresholdSec = input.thresholdSec ?? 0.75;
  return Math.abs(input.localPositionSec - input.expectedPositionSec) > thresholdSec;
}
```

Modify `packages/shared/src/index.ts`:

```ts
export * from "./ids.js";
export * from "./playback.js";
export * from "./schemas.js";
export * from "./validation.js";
```

- [ ] **Step 5: Verify tests and typecheck**

Run:

```bash
pnpm --filter @shareus/shared test
pnpm --filter @shareus/shared typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared validation and playback helpers"
```

## Task 3: API Foundation and Auth

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/auth/password.ts`
- Create: `apps/api/src/auth/tokens.ts`
- Create: `apps/api/src/auth/auth.routes.ts`
- Create: `apps/api/src/auth/auth.test.ts`

- [ ] **Step 1: Create API package**

Create `apps/api/package.json`:

```json
{
  "name": "@shareus/api",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/sensible": "^5.6.0",
    "@shareus/shared": "workspace:*",
    "argon2": "^0.40.3",
    "fastify": "^4.27.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.10.5",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write auth tests**

Create `apps/api/src/auth/auth.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm --filter @shareus/api test
```

Expected: fails because API files do not exist.

- [ ] **Step 4: Implement config, server, and auth**

Create `apps/api/src/config.ts`:

```ts
import { z } from "zod";

export const appConfigSchema = z.object({
  adminPassword: z.string().min(8),
  adminTokenSecret: z.string().min(8),
  roomTokenSecret: z.string().min(8),
  gcpProjectId: z.string().min(1),
  gcsBucket: z.string().min(1),
  transcoderJobName: z.string().min(1),
  transcoderRegion: z.string().min(1)
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadConfig(env = process.env): AppConfig {
  return appConfigSchema.parse({
    adminPassword: env.ADMIN_PASSWORD,
    adminTokenSecret: env.ADMIN_TOKEN_SECRET,
    roomTokenSecret: env.ROOM_TOKEN_SECRET,
    gcpProjectId: env.GCP_PROJECT_ID,
    gcsBucket: env.GCS_BUCKET,
    transcoderJobName: env.TRANSCODER_JOB_NAME,
    transcoderRegion: env.TRANSCODER_REGION
  });
}
```

Create `apps/api/src/auth/password.ts`:

```ts
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

Create `apps/api/src/auth/tokens.ts`:

```ts
import crypto from "node:crypto";

export interface CreateAdminTokenInput {
  secret: string;
  ttlSec: number;
}

export async function createAdminToken(input: CreateAdminTokenInput): Promise<string> {
  const payload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + input.ttlSec
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", input.secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminToken(input: { token: string; secret: string }): Promise<{ role: "admin" }> {
  const [encodedPayload, signature] = input.token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = crypto
    .createHmac("sha256", input.secret)
    .update(encodedPayload)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    role: string;
    exp: number;
  };

  if (payload.role !== "admin" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid token");
  }

  return { role: "admin" };
}
```

Create `apps/api/src/auth/auth.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { createAdminToken } from "./tokens.js";

const loginSchema = z.object({
  password: z.string().min(1)
});

export async function registerAuthRoutes(server: FastifyInstance, config: AppConfig): Promise<void> {
  server.post("/api/auth/admin-login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    if (body.password !== config.adminPassword) {
      return reply.code(401).send({ message: "Invalid admin password" });
    }

    const token = await createAdminToken({
      secret: config.adminTokenSecret,
      ttlSec: 60 * 60 * 8
    });

    return { token };
  });
}
```

Create `apps/api/src/server.ts`:

```ts
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./auth/auth.routes.js";

export async function buildServer(config: AppConfig) {
  const server = Fastify({ logger: true });
  await server.register(cors, { origin: true });
  await server.register(sensible);

  server.get("/healthz", async () => ({ ok: true }));
  await registerAuthRoutes(server, config);

  return server;
}
```

Create `apps/api/src/index.ts`:

```ts
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const server = await buildServer(loadConfig());
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

await server.listen({ port, host });
```

- [ ] **Step 5: Verify API auth**

Run:

```bash
pnpm install
pnpm --filter @shareus/api test
pnpm --filter @shareus/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: add API foundation and admin auth"
```

## Task 4: Video Metadata, GCS Validation, and Playlist Rewriting

**Files:**
- Create: `apps/api/src/videos/video.model.ts`
- Create: `apps/api/src/videos/video.service.ts`
- Create: `apps/api/src/videos/video.routes.ts`
- Create: `apps/api/src/videos/video.service.test.ts`
- Create: `apps/api/src/gcs/storage.ts`
- Create: `apps/api/src/gcs/playlist.ts`
- Create: `apps/api/src/gcs/playlist.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Write playlist rewriting test**

Create `apps/api/src/gcs/playlist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rewritePlaylistWithSignedSegments } from "./playlist.js";

describe("rewritePlaylistWithSignedSegments", () => {
  it("rewrites relative segment paths to signed URLs", async () => {
    const playlist = "#EXTM3U\n#EXTINF:4.0,\nseg-000.ts\n#EXTINF:4.0,\nnested/seg-001.ts\n";
    const rewritten = await rewritePlaylistWithSignedSegments({
      playlist,
      hlsPrefix: "videos/vid_1/hls",
      signSegment: async (objectPath) => `https://signed.example/${objectPath}`
    });

    expect(rewritten).toContain("https://signed.example/videos/vid_1/hls/seg-000.ts");
    expect(rewritten).toContain("https://signed.example/videos/vid_1/hls/nested/seg-001.ts");
    expect(rewritten).toContain("#EXTM3U");
  });
});
```

- [ ] **Step 2: Write video service test**

Create `apps/api/src/videos/video.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createVideoService } from "./video.service.js";

describe("video service", () => {
  it("imports a valid upload object as an imported video", async () => {
    const writes: unknown[] = [];
    const service = createVideoService({
      objectExists: async () => true,
      saveVideo: async (video) => {
        writes.push(video);
        return video;
      },
      listVideos: async () => [],
      deleteVideo: async () => undefined,
      deletePrefix: async () => undefined
    });

    const video = await service.importVideo({ title: "Movie", sourceObjectPath: "uploads/movie.mp4" });

    expect(video).toMatchObject({
      title: "Movie",
      sourceObjectPath: "uploads/movie.mp4",
      status: "imported"
    });
    expect(writes).toHaveLength(1);
  });

  it("rejects a missing GCS object", async () => {
    const service = createVideoService({
      objectExists: async () => false,
      saveVideo: async (video) => video,
      listVideos: async () => [],
      deleteVideo: async () => undefined,
      deletePrefix: async () => undefined
    });

    await expect(service.importVideo({ title: "Movie", sourceObjectPath: "uploads/missing.mp4" }))
      .rejects.toThrow("Source object does not exist");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm --filter @shareus/api test
```

Expected: fails because video and GCS modules do not exist.

- [ ] **Step 4: Implement playlist helper**

Create `apps/api/src/gcs/playlist.ts`:

```ts
export interface RewritePlaylistInput {
  playlist: string;
  hlsPrefix: string;
  signSegment: (objectPath: string) => Promise<string>;
}

export async function rewritePlaylistWithSignedSegments(input: RewritePlaylistInput): Promise<string> {
  const lines = input.playlist.split("\n");
  const rewrittenLines = await Promise.all(lines.map(async (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^https?:\/\//.test(trimmed)) {
      return line;
    }

    const objectPath = `${input.hlsPrefix.replace(/\/$/, "")}/${trimmed.replace(/^\//, "")}`;
    return input.signSegment(objectPath);
  }));

  return rewrittenLines.join("\n");
}
```

- [ ] **Step 5: Implement video model and service**

Create `apps/api/src/videos/video.model.ts`:

```ts
import type { VideoStatus } from "@shareus/shared";

export interface VideoRecord {
  id: string;
  title: string;
  sourceObjectPath: string;
  status: VideoStatus;
  hlsPrefix: string | null;
  durationSec: number | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Create `apps/api/src/videos/video.service.ts`:

```ts
import { createVideoId, parseUploadObjectPath } from "@shareus/shared";
import type { VideoRecord } from "./video.model.js";

export interface VideoRepository {
  objectExists: (objectPath: string) => Promise<boolean>;
  saveVideo: (video: VideoRecord) => Promise<VideoRecord>;
  listVideos: () => Promise<VideoRecord[]>;
  deleteVideo: (videoId: string) => Promise<void>;
  deletePrefix: (prefix: string) => Promise<void>;
}

export function createVideoService(repo: VideoRepository) {
  return {
    async importVideo(input: { title: string; sourceObjectPath: string }): Promise<VideoRecord> {
      const parsed = parseUploadObjectPath(input.sourceObjectPath);
      const exists = await repo.objectExists(parsed.objectPath);
      if (!exists) {
        throw new Error("Source object does not exist");
      }

      const now = new Date().toISOString();
      const id = createVideoId();
      return repo.saveVideo({
        id,
        title: input.title.trim(),
        sourceObjectPath: parsed.objectPath,
        status: "imported",
        hlsPrefix: null,
        durationSec: null,
        failureMessage: null,
        createdAt: now,
        updatedAt: now
      });
    },
    listVideos: repo.listVideos,
    async deleteVideo(video: VideoRecord): Promise<void> {
      if (video.hlsPrefix) {
        await repo.deletePrefix(video.hlsPrefix);
      }
      await repo.deleteVideo(video.id);
    }
  };
}
```

- [ ] **Step 6: Add route shell**

Create `apps/api/src/videos/video.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { createVideoService, type VideoRepository } from "./video.service.js";

const importVideoSchema = z.object({
  title: z.string().min(1),
  sourceObjectPath: z.string().min(1)
});

export async function registerVideoRoutes(
  server: FastifyInstance,
  config: AppConfig,
  repo: VideoRepository
): Promise<void> {
  const videos = createVideoService(repo);

  async function requireAdmin(request: { headers: Record<string, unknown> }) {
    const header = String(request.headers.authorization ?? "");
    const token = header.replace(/^Bearer\s+/i, "");
    await verifyAdminToken({ token, secret: config.adminTokenSecret });
  }

  server.get("/api/videos", async () => videos.listVideos());

  server.post("/api/videos/import", async (request, reply) => {
    await requireAdmin(request);
    const body = importVideoSchema.parse(request.body);
    try {
      return await videos.importVideo(body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Video import failed" });
    }
  });
}
```

- [ ] **Step 7: Verify tests**

Run:

```bash
pnpm --filter @shareus/api test
pnpm --filter @shareus/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/gcs apps/api/src/videos
git commit -m "feat: add video import and playlist signing helpers"
```

## Task 5: Transcoder Worker and Job Invocation

**Files:**
- Create: `apps/transcoder/package.json`
- Create: `apps/transcoder/tsconfig.json`
- Create: `apps/transcoder/Dockerfile`
- Create: `apps/transcoder/src/ffmpeg.ts`
- Create: `apps/transcoder/src/ffmpeg.test.ts`
- Create: `apps/transcoder/src/index.ts`
- Create: `apps/api/src/transcode/transcode.service.ts`
- Create: `apps/api/src/transcode/transcode.service.test.ts`
- Create: `apps/api/src/transcode/transcode.routes.ts`

- [ ] **Step 1: Write ffmpeg command test**

Create `apps/transcoder/src/ffmpeg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHlsCommandArgs } from "./ffmpeg.js";

describe("buildHlsCommandArgs", () => {
  it("builds a single-rendition HLS command", () => {
    expect(buildHlsCommandArgs({
      inputPath: "/tmp/input.mp4",
      outputPlaylistPath: "/tmp/hls/index.m3u8"
    })).toEqual([
      "-y",
      "-i", "/tmp/input.mp4",
      "-c:v", "h264",
      "-c:a", "aac",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", "/tmp/hls/segment-%05d.ts",
      "/tmp/hls/index.m3u8"
    ]);
  });
});
```

- [ ] **Step 2: Create transcoder package and implementation**

Create `apps/transcoder/package.json`:

```json
{
  "name": "@shareus/transcoder",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.7.0",
    "@google-cloud/storage": "^7.11.2"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `apps/transcoder/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/transcoder/src/ffmpeg.ts`:

```ts
export interface BuildHlsCommandInput {
  inputPath: string;
  outputPlaylistPath: string;
}

export function buildHlsCommandArgs(input: BuildHlsCommandInput): string[] {
  const outputDir = input.outputPlaylistPath.replace(/\/index\.m3u8$/, "");
  return [
    "-y",
    "-i", input.inputPath,
    "-c:v", "h264",
    "-c:a", "aac",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", `${outputDir}/segment-%05d.ts`,
    input.outputPlaylistPath
  ];
}
```

Create `apps/transcoder/Dockerfile`:

```Dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/transcoder/package.json apps/transcoder/package.json
RUN pnpm install --filter @shareus/transcoder... --frozen-lockfile
COPY apps/transcoder apps/transcoder
RUN pnpm --filter @shareus/transcoder build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/transcoder/dist ./dist
COPY --from=build /app/apps/transcoder/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Implement transcode entrypoint**

Create `apps/transcoder/src/index.ts`:

```ts
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { buildHlsCommandArgs } from "./ffmpeg.js";

const videoId = requiredEnv("VIDEO_ID");
const bucketName = requiredEnv("GCS_BUCKET");
const sourceObjectPath = requiredEnv("SOURCE_OBJECT_PATH");
const hlsPrefix = `videos/${videoId}/hls`;

const storage = new Storage();
const firestore = new Firestore();
const bucket = storage.bucket(bucketName);

await firestore.collection("videos").doc(videoId).update({
  status: "processing",
  updatedAt: new Date().toISOString()
});

try {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "shareus-"));
  const inputPath = path.join(tempDir, "source");
  const outputDir = path.join(tempDir, "hls");
  const playlistPath = path.join(outputDir, "index.m3u8");
  await mkdir(outputDir, { recursive: true });

  await bucket.file(sourceObjectPath).download({ destination: inputPath });
  await run("ffmpeg", buildHlsCommandArgs({ inputPath, outputPlaylistPath: playlistPath }));

  for (const filename of await readdir(outputDir)) {
    await bucket.upload(path.join(outputDir, filename), {
      destination: `${hlsPrefix}/${filename}`
    });
  }

  await firestore.collection("videos").doc(videoId).update({
    status: "ready",
    hlsPrefix,
    failureMessage: null,
    updatedAt: new Date().toISOString()
  });
} catch (error) {
  await firestore.collection("videos").doc(videoId).update({
    status: "failed",
    failureMessage: error instanceof Error ? error.message : "Unknown transcode failure",
    updatedAt: new Date().toISOString()
  });
  throw error;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
```

- [ ] **Step 4: Add API transcode service test and service**

Create `apps/api/src/transcode/transcode.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTranscodeService } from "./transcode.service.js";

describe("transcode service", () => {
  it("starts a job with the video environment", async () => {
    const calls: unknown[] = [];
    const service = createTranscodeService({
      startJob: async (env) => {
        calls.push(env);
      },
      getVideo: async () => ({ id: "vid_1", sourceObjectPath: "uploads/movie.mp4", status: "imported" }),
      markProcessing: async () => undefined
    });

    await service.startTranscode({
      videoId: "vid_1",
      bucket: "bucket-name"
    });

    expect(calls).toEqual([{
      VIDEO_ID: "vid_1",
      SOURCE_OBJECT_PATH: "uploads/movie.mp4",
      GCS_BUCKET: "bucket-name"
    }]);
  });
});
```

Create `apps/api/src/transcode/transcode.service.ts`:

```ts
export interface TranscodeGateway {
  startJob: (env: Record<string, string>) => Promise<void>;
  getVideo: (videoId: string) => Promise<{ id: string; sourceObjectPath: string; status: string } | null>;
  markProcessing: (videoId: string) => Promise<void>;
}

export function createTranscodeService(gateway: TranscodeGateway) {
  return {
    async startTranscode(input: { videoId: string; bucket: string }): Promise<void> {
      const video = await gateway.getVideo(input.videoId);
      if (!video) {
        throw new Error("Video not found");
      }
      if (video.status !== "imported" && video.status !== "failed") {
        throw new Error("Video is not ready for transcode");
      }

      await gateway.markProcessing(input.videoId);

      await gateway.startJob({
        VIDEO_ID: input.videoId,
        SOURCE_OBJECT_PATH: video.sourceObjectPath,
        GCS_BUCKET: input.bucket
      });
    }
  };
}
```

Create `apps/api/src/transcode/transcode.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { createTranscodeService, type TranscodeGateway } from "./transcode.service.js";

export async function registerTranscodeRoutes(
  server: FastifyInstance,
  config: AppConfig,
  gateway: TranscodeGateway
): Promise<void> {
  const service = createTranscodeService(gateway);

  server.post<{ Params: { videoId: string } }>("/api/videos/:videoId/transcode", async (request) => {
    const token = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    await verifyAdminToken({ token, secret: config.adminTokenSecret });

    await service.startTranscode({
      videoId: request.params.videoId,
      bucket: config.gcsBucket
    });

    return { ok: true };
  });
}
```

- [ ] **Step 5: Verify transcode packages**

Run:

```bash
pnpm install
pnpm --filter @shareus/transcoder test
pnpm --filter @shareus/transcoder typecheck
pnpm --filter @shareus/api test
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add apps/transcoder apps/api/src/transcode package.json pnpm-lock.yaml
git commit -m "feat: add transcode worker and job service"
```

## Task 6: Room Lifecycle and Socket Sync

**Files:**
- Create: `apps/api/src/rooms/room.model.ts`
- Create: `apps/api/src/rooms/room.service.ts`
- Create: `apps/api/src/rooms/room.service.test.ts`
- Create: `apps/api/src/rooms/room.routes.ts`
- Create: `apps/api/src/rooms/room.socket.ts`
- Create: `apps/api/src/rooms/room.socket.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add Socket.IO dependency**

Modify `apps/api/package.json` dependencies to include:

```json
"socket.io": "^4.7.5"
```

Run:

```bash
pnpm install
```

- [ ] **Step 2: Write room service tests**

Create `apps/api/src/rooms/room.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRoomService } from "./room.service.js";

describe("room service", () => {
  it("creates a room for a ready video", async () => {
    const service = createRoomService({
      getVideo: async () => ({ id: "vid_1", status: "ready" }),
      saveRoom: async (room) => room,
      getRoom: async () => null,
      updateRoom: async () => undefined
    });

    const room = await service.createRoom({ videoId: "vid_1", password: "room-secret" });

    expect(room).toMatchObject({
      videoId: "vid_1",
      status: "open",
      playbackState: null
    });
    expect(room.passwordHash).not.toBe("room-secret");
  });

  it("rejects rooms for videos that are not ready", async () => {
    const service = createRoomService({
      getVideo: async () => ({ id: "vid_1", status: "processing" }),
      saveRoom: async (room) => room,
      getRoom: async () => null,
      updateRoom: async () => undefined
    });

    await expect(service.createRoom({ videoId: "vid_1", password: "room-secret" }))
      .rejects.toThrow("Video is not ready");
  });
});
```

- [ ] **Step 3: Implement room model and service**

Create `apps/api/src/rooms/room.model.ts`:

```ts
import type { PlaybackState } from "@shareus/shared";

export interface RoomRecord {
  id: string;
  videoId: string;
  passwordHash: string;
  status: "open" | "closed";
  playbackState: PlaybackState | null;
  createdAt: string;
  updatedAt: string;
}
```

Create `apps/api/src/rooms/room.service.ts`:

```ts
import { createRoomId } from "@shareus/shared";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { RoomRecord } from "./room.model.js";

export interface RoomRepository {
  getVideo: (videoId: string) => Promise<{ id: string; status: string } | null>;
  saveRoom: (room: RoomRecord) => Promise<RoomRecord>;
  getRoom: (roomId: string) => Promise<RoomRecord | null>;
  updateRoom: (roomId: string, patch: Partial<RoomRecord>) => Promise<void>;
}

export function createRoomService(repo: RoomRepository) {
  return {
    async createRoom(input: { videoId: string; password: string }): Promise<RoomRecord> {
      const video = await repo.getVideo(input.videoId);
      if (!video || video.status !== "ready") {
        throw new Error("Video is not ready");
      }

      const now = new Date().toISOString();
      return repo.saveRoom({
        id: createRoomId(),
        videoId: input.videoId,
        passwordHash: await hashPassword(input.password),
        status: "open",
        playbackState: null,
        createdAt: now,
        updatedAt: now
      });
    },
    async joinRoom(input: { roomId: string; password: string }): Promise<RoomRecord> {
      const room = await repo.getRoom(input.roomId);
      if (!room || room.status !== "open") {
        throw new Error("Room is not available");
      }
      if (!(await verifyPassword(room.passwordHash, input.password))) {
        throw new Error("Invalid room password");
      }
      return room;
    },
    async updatePlayback(roomId: string, playbackState: RoomRecord["playbackState"]): Promise<void> {
      await repo.updateRoom(roomId, {
        playbackState,
        updatedAt: new Date().toISOString()
      });
    }
  };
}
```

- [ ] **Step 4: Add room routes and socket registration**

Create `apps/api/src/rooms/room.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { verifyAdminToken } from "../auth/tokens.js";
import { createRoomService, type RoomRepository } from "./room.service.js";

const createRoomSchema = z.object({
  videoId: z.string().min(1),
  password: z.string().min(4)
});

const joinRoomSchema = z.object({
  password: z.string().min(1)
});

export async function registerRoomRoutes(
  server: FastifyInstance,
  config: AppConfig,
  repo: RoomRepository
): Promise<void> {
  const rooms = createRoomService(repo);

  server.post("/api/rooms", async (request) => {
    const token = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    await verifyAdminToken({ token, secret: config.adminTokenSecret });
    return rooms.createRoom(createRoomSchema.parse(request.body));
  });

  server.post<{ Params: { roomId: string } }>("/api/rooms/:roomId/join", async (request) => {
    const body = joinRoomSchema.parse(request.body);
    const room = await rooms.joinRoom({ roomId: request.params.roomId, password: body.password });
    return { roomId: room.id, videoId: room.videoId, playbackState: room.playbackState };
  });
}
```

Create `apps/api/src/rooms/room.socket.ts`:

```ts
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";

const playbackSocketPayloadSchema = z.object({
  roomId: z.string().min(1),
  videoId: z.string().min(1),
  isPlaying: z.boolean(),
  positionSec: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1)
});

export function attachRoomSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: true }
  });

  io.on("connection", (socket) => {
    socket.on("room:join", ({ roomId }: { roomId: string }) => {
      socket.join(roomId);
    });

    socket.on("playback:update", (payload: unknown) => {
      const parsed = playbackSocketPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid playback payload" });
        return;
      }
      socket.to(parsed.data.roomId).emit("playback:remote-update", parsed.data);
    });

    socket.on("chat:message", (payload: { roomId: string; message: string }) => {
      socket.to(payload.roomId).emit("chat:message", {
        message: payload.message,
        sentAt: new Date().toISOString()
      });
    });
  });

  return io;
}
```

- [ ] **Step 5: Verify room tests**

Run:

```bash
pnpm --filter @shareus/api test
pnpm --filter @shareus/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/rooms apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add private rooms and realtime sync"
```

## Task 7: Firestore and GCS Adapters

**Files:**
- Create: `apps/api/src/gcs/storage.ts`
- Create: `apps/api/src/firestore.ts`
- Create: `apps/api/src/transcode/cloudRunJob.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/videos/video.routes.ts`
- Modify: `apps/api/src/rooms/room.routes.ts`
- Modify: `apps/api/src/transcode/transcode.routes.ts`

- [ ] **Step 1: Add Google Cloud dependencies**

Modify `apps/api/package.json` dependencies to include:

```json
"@google-cloud/firestore": "^7.7.0",
"@google-cloud/storage": "^7.11.2",
"google-auth-library": "^9.10.0"
```

Run:

```bash
pnpm install
```

- [ ] **Step 2: Implement GCS adapter**

Create `apps/api/src/gcs/storage.ts`:

```ts
import { Storage } from "@google-cloud/storage";

export function createStorageAdapter(bucketName: string) {
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  return {
    async objectExists(objectPath: string): Promise<boolean> {
      const [exists] = await bucket.file(objectPath).exists();
      return exists;
    },
    async readText(objectPath: string): Promise<string> {
      const [buffer] = await bucket.file(objectPath).download();
      return buffer.toString("utf8");
    },
    async signReadUrl(objectPath: string, expiresInMs = 15 * 60 * 1000): Promise<string> {
      const [url] = await bucket.file(objectPath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + expiresInMs
      });
      return url;
    },
    async deletePrefix(prefix: string): Promise<void> {
      await bucket.deleteFiles({ prefix, force: true });
    }
  };
}
```

- [ ] **Step 3: Implement Firestore adapter**

Create `apps/api/src/firestore.ts`:

```ts
import { Firestore } from "@google-cloud/firestore";
import type { RoomRecord } from "./rooms/room.model.js";
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
    }
  };
}
```

- [ ] **Step 4: Wire adapters into server**

Create `apps/api/src/transcode/cloudRunJob.ts`:

```ts
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "../config.js";

export function createCloudRunJobStarter(config: AppConfig) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const jobName = `projects/${config.gcpProjectId}/locations/${config.transcoderRegion}/jobs/${config.transcoderJobName}`;

  return async function startJob(env: Record<string, string>): Promise<void> {
    const client = await auth.getClient();
    const url = `https://run.googleapis.com/v2/${jobName}:run`;
    const response = await client.request({
      url,
      method: "POST",
      data: {
        overrides: {
          containerOverrides: [{
            env: Object.entries(env).map(([name, value]) => ({ name, value }))
          }]
        }
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Cloud Run Job start failed with status ${response.status}`);
    }
  };
}
```

Replace `apps/api/src/server.ts` with this adapter-wired version:

```ts
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./auth/auth.routes.js";
import { createFirestoreAdapter } from "./firestore.js";
import { createStorageAdapter } from "./gcs/storage.js";
import { registerRoomRoutes } from "./rooms/room.routes.js";
import type { RoomRepository } from "./rooms/room.service.js";
import { createCloudRunJobStarter } from "./transcode/cloudRunJob.js";
import { registerTranscodeRoutes } from "./transcode/transcode.routes.js";
import type { TranscodeGateway } from "./transcode/transcode.service.js";
import { registerVideoRoutes } from "./videos/video.routes.js";
import type { VideoRepository } from "./videos/video.service.js";

export interface ServerDeps {
  videoRepo?: VideoRepository;
  roomRepo?: RoomRepository;
  transcodeGateway?: TranscodeGateway;
}

export async function buildServer(config: AppConfig, deps: ServerDeps = {}) {
  const server = Fastify({ logger: true });
  await server.register(cors, { origin: true });
  await server.register(sensible);

  const firestore = createFirestoreAdapter();
  const storage = createStorageAdapter(config.gcsBucket);

  const videoRepo = deps.videoRepo ?? {
    objectExists: storage.objectExists,
    saveVideo: firestore.saveVideo,
    listVideos: firestore.listVideos,
    deleteVideo: firestore.deleteVideo,
    deletePrefix: storage.deletePrefix
  };

  const roomRepo = deps.roomRepo ?? {
    getVideo: firestore.getVideo,
    saveRoom: firestore.saveRoom,
    getRoom: firestore.getRoom,
    updateRoom: firestore.updateRoom
  };

  const transcodeGateway = deps.transcodeGateway ?? {
    startJob: createCloudRunJobStarter(config),
    getVideo: async (videoId: string) => {
      const video = await firestore.getVideo(videoId);
      return video ? { id: video.id, sourceObjectPath: video.sourceObjectPath, status: video.status } : null;
    },
    markProcessing: async (videoId: string) => {
      await firestore.updateVideo(videoId, {
        status: "processing",
        updatedAt: new Date().toISOString()
      });
    }
  };

  server.get("/healthz", async () => ({ ok: true }));
  await registerAuthRoutes(server, config);
  await registerVideoRoutes(server, config, videoRepo);
  await registerRoomRoutes(server, config, roomRepo);
  await registerTranscodeRoutes(server, config, transcodeGateway);

  return server;
}
```

- [ ] **Step 5: Verify typecheck**

Run:

```bash
pnpm --filter @shareus/api typecheck
pnpm --filter @shareus/api test
```

Expected: tests and typecheck pass without real GCP credentials because tests inject fake adapters.

- [ ] **Step 6: Commit**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: wire Firestore and GCS adapters"
```

## Task 8: Next.js Frontend

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/admin/page.tsx`
- Create: `apps/web/app/room/[roomId]/page.tsx`
- Create: `apps/web/components/AdminLogin.tsx`
- Create: `apps/web/components/VideoLibrary.tsx`
- Create: `apps/web/components/HlsPlayer.tsx`
- Create: `apps/web/components/ChatPanel.tsx`
- Create: `apps/web/components/RoomControls.tsx`
- Create: `apps/web/lib/apiClient.ts`
- Create: `apps/web/lib/socketClient.ts`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@shareus/web",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "dev": "next dev -p 3000",
    "lint": "next lint",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@shareus/shared": "workspace:*",
    "hls.js": "^1.5.8",
    "next": "^14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.7",
    "@types/react": "^18.3.2",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"
  }
};

export default nextConfig;
```

- [ ] **Step 2: Implement API client**

Create `apps/web/lib/apiClient.ts`:

```ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

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

export async function listVideos() {
  const response = await fetch(`${apiBaseUrl}/api/videos`);
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
    headers: { "authorization": `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to start transcode");
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
  return response.json();
}
```

- [ ] **Step 3: Implement layout and home**

Create `apps/web/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: #0f1115;
  color: #f4f6fb;
}
```

Create `apps/web/app/layout.tsx`:

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6">
      <p className="text-sm text-slate-400">Shareus</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-normal">私人双人观影房间</h1>
      <div className="mt-8 flex gap-3">
        <Link className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950" href="/admin">进入管理页</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Implement admin UI**

Create `apps/web/components/AdminLogin.tsx`:

```tsx
"use client";

import { useState } from "react";
import { adminLogin } from "../lib/apiClient";

export function AdminLogin({ onToken }: { onToken: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      const token = await adminLogin(password);
      onToken(token);
      setError(null);
    } catch {
      setError("管理员密码不正确");
    }
  }

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold">管理页</h1>
      <input
        className="mt-6 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="管理员密码"
      />
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <button className="mt-4 w-full rounded-md bg-white px-4 py-2 text-slate-950" onClick={submit}>进入</button>
    </section>
  );
}
```

Create `apps/web/components/VideoLibrary.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createRoom, importVideo, listVideos, startTranscode } from "../lib/apiClient";

interface VideoRecord {
  id: string;
  title: string;
  sourceObjectPath: string;
  status: string;
}

export function VideoLibrary({ token }: { token: string }) {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [title, setTitle] = useState("");
  const [sourceObjectPath, setSourceObjectPath] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setVideos(await listVideos());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitImport() {
    await importVideo(token, { title, sourceObjectPath });
    setTitle("");
    setSourceObjectPath("");
    setNotice("视频已导入");
    await refresh();
  }

  async function submitRoom(videoId: string) {
    const room = await createRoom(token, { videoId, password: roomPassword });
    setNotice(`房间已创建：/room/${room.id}`);
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 p-4">
        <h1 className="text-2xl font-semibold">片库</h1>
        <input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="片名" />
        <input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={sourceObjectPath} onChange={(event) => setSourceObjectPath(event.target.value)} placeholder="uploads/movie.mp4" />
        <button className="rounded-md bg-white px-4 py-2 text-slate-950" onClick={submitImport}>导入 GCS 视频</button>
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      </div>
      <div className="mt-6 grid gap-3">
        {videos.map((video) => (
          <article className="rounded-md border border-slate-800 p-4" key={video.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-medium">{video.title}</h2>
                <p className="text-sm text-slate-400">{video.sourceObjectPath} · {video.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => startTranscode(token, video.id)}>转码</button>
                <input className="w-36 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="房间密码" />
                <button className="rounded-md bg-white px-3 py-2 text-sm text-slate-950" disabled={video.status !== "ready"} onClick={() => submitRoom(video.id)}>创建房间</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Create `apps/web/app/admin/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AdminLogin } from "../../components/AdminLogin";
import { VideoLibrary } from "../../components/VideoLibrary";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  return (
    <main className="min-h-screen px-4 py-8">
      {token ? <VideoLibrary token={token} /> : <AdminLogin onToken={setToken} />}
    </main>
  );
}
```

- [ ] **Step 5: Implement HLS player**

Create `apps/web/components/HlsPlayer.tsx`:

```tsx
"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

export function HlsPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [src]);

  return <video ref={ref} className="aspect-video w-full bg-black" controls playsInline />;
}
```

- [ ] **Step 6: Implement room page shell**

Create `apps/web/lib/socketClient.ts`:

```ts
import { io } from "socket.io-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export function createRoomSocket(roomId: string) {
  const socket = io(apiBaseUrl, { transports: ["websocket"] });
  socket.on("connect", () => socket.emit("room:join", { roomId }));
  return socket;
}
```

Create `apps/web/components/ChatPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Socket } from "socket.io-client";

export function ChatPanel({ roomId, socket }: { roomId: string; socket: Socket | null }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  function send() {
    if (!draft.trim()) return;
    socket?.emit("chat:message", { roomId, message: draft.trim() });
    setMessages((current) => [...current, `我：${draft.trim()}`]);
    setDraft("");
  }

  return (
    <aside className="flex min-h-64 flex-col rounded-md border border-slate-800 p-3">
      <div className="flex-1 space-y-2 text-sm">
        {messages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="rounded-md bg-white px-3 py-2 text-slate-950" onClick={send}>发送</button>
      </div>
    </aside>
  );
}
```

Create `apps/web/components/RoomControls.tsx`:

```tsx
export function RoomControls({ status }: { status: string }) {
  return (
    <div className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300">
      {status}
    </div>
  );
}
```

Create `apps/web/app/room/[roomId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChatPanel } from "../../../components/ChatPanel";
import { HlsPlayer } from "../../../components/HlsPlayer";
import { RoomControls } from "../../../components/RoomControls";
import { joinRoom } from "../../../lib/apiClient";
import { createRoomSocket } from "../../../lib/socketClient";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const [password, setPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState("等待加入");
  const playlistUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/api/rooms/${params.roomId}/playlist.m3u8`;

  useEffect(() => () => {
    socket?.disconnect();
  }, [socket]);

  async function submitJoin() {
    await joinRoom(params.roomId, password);
    const nextSocket = createRoomSocket(params.roomId);
    setSocket(nextSocket);
    setJoined(true);
    setStatus("已同步");
  }

  if (!joined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <h1 className="text-2xl font-semibold">加入房间</h1>
        <input className="mt-6 rounded-md border border-slate-700 bg-slate-900 px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="房间密码" />
        <button className="mt-4 rounded-md bg-white px-4 py-2 text-slate-950" onClick={submitJoin}>进入</button>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <HlsPlayer src={playlistUrl} />
        <RoomControls status={status} />
      </section>
      <ChatPanel roomId={params.roomId} socket={socket} />
    </main>
  );
}
```

- [ ] **Step 7: Verify frontend**

Run:

```bash
pnpm install
pnpm --filter @shareus/web typecheck
pnpm --filter @shareus/web build
```

Expected: typecheck and Next.js build pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add responsive web interface"
```

## Task 9: End-to-End Local Flow

**Files:**
- Create: `docker-compose.yml`
- Create: `docs/local-development.md`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/web/lib/apiClient.ts`

- [ ] **Step 1: Add local development doc**

Create `docs/local-development.md`:

```md
# Local Development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill local values.
3. Run the API with `pnpm --filter @shareus/api dev`.
4. Run the web app with `pnpm --filter @shareus/web dev`.
5. Open `http://localhost:3000`.

For full GCS and Firestore behavior, use a Google Cloud project with Application Default Credentials:

```bash
gcloud auth application-default login
```

Manual video upload:

1. Open Google Cloud Console.
2. Upload `mp4`, `mov`, or `mkv` files to `gs://<bucket>/uploads/`.
3. In the admin page, import the object path such as `uploads/movie.mp4`.
```

- [ ] **Step 2: Add smoke test checklist**

Add this section to the end of `docs/local-development.md`:

```md
## Smoke Test

- Admin login accepts the configured password.
- Import rejects `videos/movie.mp4`.
- Import accepts `uploads/sample.mp4` when the object exists.
- Transcode changes status to `processing`.
- A ready video can create a room.
- Two browser windows can join the same room.
- Play, pause, seek, and chat appear in the second window.
```

- [ ] **Step 3: Run local verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all packages pass tests, typecheck, and build.

- [ ] **Step 4: Start dev servers**

Run:

```bash
pnpm dev
```

Expected: API listens on `http://localhost:8080` and web listens on `http://localhost:3000`.

- [ ] **Step 5: Browser smoke test**

Open `http://localhost:3000` and verify:

- Home page renders.
- Admin page prompts for password.
- Wrong password shows an error.
- Correct password opens the video library.
- Room page renders on mobile and desktop viewport widths.

- [ ] **Step 6: Commit**

```bash
git add docs/local-development.md docker-compose.yml apps
git commit -m "test: document and verify local watch flow"
```

## Task 10: Google Cloud Deployment Artifacts

**Files:**
- Create: `infra/cloudrun.service.yaml`
- Create: `infra/cloudrun.transcoder-job.yaml`
- Create: `infra/firestore.indexes.json`
- Create: `infra/gcs-cors.json`
- Create: `docs/deployment.md`
- Create: `Dockerfile`

- [ ] **Step 1: Create app Dockerfile**

Create root `Dockerfile`:

```Dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @shareus/shared build
RUN pnpm --filter @shareus/api build
RUN pnpm --filter @shareus/web build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
CMD ["node", "apps/api/dist/index.js"]
```

- [ ] **Step 2: Create Cloud Run examples**

Create `infra/cloudrun.service.yaml`:

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: shareus-watch-party
spec:
  template:
    spec:
      containers:
        - image: REGION-docker.pkg.dev/PROJECT/shareus/app:latest
          ports:
            - containerPort: 8080
          env:
            - name: GCP_PROJECT_ID
              value: PROJECT
            - name: GCS_BUCKET
              value: BUCKET
            - name: TRANSCODER_JOB_NAME
              value: shareus-transcoder
            - name: TRANSCODER_REGION
              value: REGION
```

Create `infra/cloudrun.transcoder-job.yaml`:

```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: shareus-transcoder
spec:
  template:
    spec:
      template:
        spec:
          containers:
            - image: REGION-docker.pkg.dev/PROJECT/shareus/transcoder:latest
          maxRetries: 1
          timeoutSeconds: 7200
```

- [ ] **Step 3: Create deployment doc**

Create `docs/deployment.md`:

```md
# Google Cloud Deployment

## Required services

- Cloud Run
- Cloud Run Jobs
- Firestore Native mode
- Cloud Storage
- Secret Manager
- Artifact Registry

## Storage

Create one private bucket and upload source files manually under `uploads/`.

## Secrets

Store:

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `ROOM_TOKEN_SECRET`

## Deploy flow

1. Build and push the app image.
2. Build and push the transcoder image.
3. Deploy the Cloud Run service.
4. Deploy the Cloud Run Job.
5. Grant the service account access to Firestore, GCS, and Cloud Run Jobs.
6. Open the Cloud Run URL and log in to `/admin`.
```

- [ ] **Step 4: Verify Docker build locally**

Run:

```bash
docker build -t shareus-watch-party .
docker build -t shareus-transcoder apps/transcoder
```

Expected: both images build successfully.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile infra docs/deployment.md apps/transcoder/Dockerfile
git commit -m "chore: add Google Cloud deployment artifacts"
```

## Task 11: Final Acceptance

**Files:**
- Modify: only files directly responsible for failed checks discovered in this task.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands pass.

- [ ] **Step 2: Run API smoke check**

Run:

```bash
ADMIN_PASSWORD=change-me \
ADMIN_TOKEN_SECRET=replace-with-random-32-byte-secret \
ROOM_TOKEN_SECRET=replace-with-random-32-byte-secret \
GCP_PROJECT_ID=local \
GCS_BUCKET=local-bucket \
TRANSCODER_JOB_NAME=shareus-transcoder \
TRANSCODER_REGION=asia-east1 \
pnpm --filter @shareus/api dev
```

In another terminal:

```bash
curl http://localhost:8080/healthz
```

Expected response:

```json
{"ok":true}
```

- [ ] **Step 3: Run web smoke check**

Run:

```bash
pnpm --filter @shareus/web dev
```

Open `http://localhost:3000`. Expected:

- Home page renders.
- `/admin` renders.
- Mobile viewport at 390px wide does not overlap text or controls.

- [ ] **Step 4: Final commit**

```bash
git status --short
git add .
git commit -m "feat: complete private watch party MVP"
```

Only commit if there are remaining intentional changes after the previous task commits.

---

## Plan Self-Review

Spec coverage:

- Manual GCS upload is covered by Tasks 4, 5, 7, 9, and 10.
- Admin-password management is covered by Task 3 and frontend wiring in Task 8.
- Supported video formats are enforced in Task 2 and used by Task 4.
- HLS transcoding is covered by Task 5.
- Private GCS playback through rewritten signed segment URLs is covered by Task 4 and adapter wiring in Task 7.
- Two-person room creation, joining, sync, and chat are covered by Task 6 and frontend wiring in Task 8.
- Manual deletion is represented in Task 4 and must be wired into the admin library in Task 8.
- Google Cloud deployment is covered by Task 10.

Known implementation notes:

- The Cloud Run Job starter uses the REST API through `google-auth-library`, so it does not depend on generated client surface changes.
- The Socket.IO payload schema is explicit in the plan and should stay aligned with `PlaybackState`.
- Project-specific IAM principals are environment-specific; `docs/deployment.md` provides the service access checklist and the implementer should fill concrete project ids while deploying.

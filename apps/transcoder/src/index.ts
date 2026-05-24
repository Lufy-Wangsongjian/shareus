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

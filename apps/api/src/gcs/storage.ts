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
    async getObjectSize(objectPath: string): Promise<number> {
      const [metadata] = await bucket.file(objectPath).getMetadata();
      return Number(metadata.size ?? 0);
    },
    openReadStream(objectPath: string, range?: { start: number; end?: number }) {
      return bucket.file(objectPath).createReadStream(
        range ? { start: range.start, end: range.end } : undefined
      );
    },
    async deletePrefix(prefix: string): Promise<void> {
      await bucket.deleteFiles({ prefix, force: true });
    },
    async writeBuffer(objectPath: string, data: Buffer, contentType: string): Promise<void> {
      await bucket.file(objectPath).save(data, {
        contentType,
        resumable: false,
        metadata: {
          cacheControl: "private, max-age=3600"
        }
      });
    }
  };
}

export type StorageAdapter = ReturnType<typeof createStorageAdapter>;

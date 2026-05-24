export interface GcsStorage {
  objectExists: (objectPath: string) => Promise<boolean>;
  deletePrefix: (prefix: string) => Promise<void>;
}

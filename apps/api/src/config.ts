import { z } from "zod";

export const appConfigSchema = z.object({
  adminPassword: z.string().min(8),
  adminTokenSecret: z.string().min(32),
  roomTokenSecret: z.string().min(32),
  gcpProjectId: z.string().min(1),
  gcsBucket: z.string().min(1),
  transcoderJobName: z.string().min(1),
  transcoderRegion: z.string().min(1),
  chatAiApiKey: z.string().min(1).optional(),
  chatAiBaseUrl: z.string().url().optional(),
  chatAiModel: z.string().min(1).optional()
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
    transcoderRegion: env.TRANSCODER_REGION,
    chatAiApiKey: env.CHAT_AI_API_KEY?.trim() || undefined,
    chatAiBaseUrl: env.CHAT_AI_BASE_URL?.trim() || undefined,
    chatAiModel: env.CHAT_AI_MODEL?.trim() || undefined
  });
}

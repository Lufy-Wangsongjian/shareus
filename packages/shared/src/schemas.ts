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

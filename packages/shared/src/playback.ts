export const SYNC_HARD_SEEK_THRESHOLD_SEC = 10;
export const SYNC_SOFT_MIN_DRIFT_SEC = 0.5;

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
  const thresholdSec = input.thresholdSec ?? SYNC_HARD_SEEK_THRESHOLD_SEC;
  return Math.abs(input.localPositionSec - input.expectedPositionSec) > thresholdSec;
}

export function shouldSoftSync(localPositionSec: number, expectedPositionSec: number): boolean {
  const drift = Math.abs(expectedPositionSec - localPositionSec);
  return drift > SYNC_SOFT_MIN_DRIFT_SEC && drift <= SYNC_HARD_SEEK_THRESHOLD_SEC;
}

export function calculatePlaybackRate(localPositionSec: number, expectedPositionSec: number): number {
  const drift = expectedPositionSec - localPositionSec;
  if (Math.abs(drift) <= SYNC_SOFT_MIN_DRIFT_SEC) {
    return 1;
  }
  if (Math.abs(drift) > SYNC_HARD_SEEK_THRESHOLD_SEC) {
    return 1;
  }

  const rate = 1 + drift / 15;
  return Math.min(1.5, Math.max(0.75, rate));
}

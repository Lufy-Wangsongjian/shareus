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

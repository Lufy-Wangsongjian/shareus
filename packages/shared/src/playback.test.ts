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

  it("does not correct drift at the default threshold boundary", () => {
    expect(shouldCorrectDrift({ localPositionSec: 10, expectedPositionSec: 10.75 })).toBe(false);
  });

  it("uses a custom threshold when provided", () => {
    expect(shouldCorrectDrift({
      localPositionSec: 10,
      expectedPositionSec: 10.5,
      thresholdSec: 0.25
    })).toBe(true);
  });
});

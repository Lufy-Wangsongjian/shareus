import { describe, expect, it } from "vitest";
import {
  calculateExpectedPosition,
  calculatePlaybackRate,
  shouldCorrectDrift,
  shouldSoftSync,
  SYNC_HARD_SEEK_THRESHOLD_SEC
} from "./playback.js";

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
  it("ignores drift within 10 seconds", () => {
    expect(shouldCorrectDrift({ localPositionSec: 10, expectedPositionSec: 19.5 })).toBe(false);
  });

  it("corrects drift above 10 seconds", () => {
    expect(shouldCorrectDrift({ localPositionSec: 10, expectedPositionSec: 20.5 })).toBe(true);
  });
});

describe("shouldSoftSync", () => {
  it("soft syncs mid-range drift", () => {
    expect(shouldSoftSync(10, 14)).toBe(true);
  });

  it("skips tiny drift", () => {
    expect(shouldSoftSync(10, 10.2)).toBe(false);
  });

  it("skips drift above hard threshold", () => {
    expect(shouldSoftSync(10, 10 + SYNC_HARD_SEEK_THRESHOLD_SEC + 1)).toBe(false);
  });
});

describe("calculatePlaybackRate", () => {
  it("returns 1 when aligned", () => {
    expect(calculatePlaybackRate(10, 10.1)).toBe(1);
  });

  it("speeds up when behind", () => {
    expect(calculatePlaybackRate(10, 13)).toBeGreaterThan(1);
  });

  it("slows down when ahead", () => {
    expect(calculatePlaybackRate(13, 10)).toBeLessThan(1);
  });
});

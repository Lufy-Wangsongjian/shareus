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

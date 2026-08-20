import { describe, it, expect } from "vitest";
import { toEmbedUrl } from "./video";

describe("toEmbedUrl", () => {
  it("converts YouTube watch URL to embed URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts YouTube short URL to embed URL", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("keeps YouTube embed URL unchanged", () => {
    expect(toEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts Vimeo URL to embed URL", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("returns non-matching URL as-is", () => {
    expect(toEmbedUrl("https://example.com/video.mp4")).toBe(
      "https://example.com/video.mp4",
    );
  });

  it("extracts YouTube ID even with extra params", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts YouTube shorts URL to embed URL", () => {
    expect(toEmbedUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts YouTube live URL to embed URL", () => {
    expect(toEmbedUrl("https://youtube.com/live/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts YouTube live URL with www to embed URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/live/abc123_-XYZ")).toBe(
      "https://www.youtube.com/embed/abc123_-XYZ",
    );
  });

  it("returns empty string for empty input", () => {
    expect(toEmbedUrl("")).toBe("");
  });
});

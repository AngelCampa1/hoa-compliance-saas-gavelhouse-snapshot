import { describe, it, expect } from "vitest";
import {
  buildR2Key,
  validateUploadContentType,
  sniffUploadType,
  MAX_UPLOAD_BYTES,
} from "../../../src/domain/governance/fileUpload.js";

describe("buildR2Key", () => {
  it("builds key with communityId/entityType/entityId/filename pattern", () => {
    expect(buildR2Key("c1", "violations", "v1", "photo.jpg")).toBe(
      "c1/violations/v1/photo.jpg",
    );
  });
  it("sanitizes path traversal attempts", () => {
    const key = buildR2Key("c1", "violations", "v1", "../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/passwd");
  });
  it("replaces unsafe characters in filename", () => {
    const key = buildR2Key("c1", "violations", "v1", "my file name!.jpg");
    expect(key).toBe("c1/violations/v1/my_file_name_.jpg");
  });
  it("preserves dots and hyphens", () => {
    const key = buildR2Key("c1", "arch-requests", "ar1", "plan-v2.pdf");
    expect(key).toBe("c1/arch-requests/ar1/plan-v2.pdf");
  });
});

describe("validateUploadContentType", () => {
  it("accepts image/jpeg", () =>
    expect(validateUploadContentType("image/jpeg")).toBe(true));
  it("accepts image/png", () =>
    expect(validateUploadContentType("image/png")).toBe(true));
  it("accepts image/gif", () =>
    expect(validateUploadContentType("image/gif")).toBe(true));
  it("accepts image/webp", () =>
    expect(validateUploadContentType("image/webp")).toBe(true));
  it("accepts application/pdf", () =>
    expect(validateUploadContentType("application/pdf")).toBe(true));
  it("rejects text/html", () =>
    expect(validateUploadContentType("text/html")).toBe(false));
  it("rejects application/javascript", () =>
    expect(validateUploadContentType("application/javascript")).toBe(false));
  it("rejects empty string", () =>
    expect(validateUploadContentType("")).toBe(false));
});

describe("MAX_UPLOAD_BYTES", () => {
  it("is exactly 10 MB (10 * 1024 * 1024)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("sniffUploadType", () => {
  function buf(...bytes: number[]): ArrayBuffer {
    return new Uint8Array(bytes).buffer;
  }

  it("identifies JPEG from FF D8 FF magic bytes", () => {
    const result = sniffUploadType(buf(0xff, 0xd8, 0xff, 0xe0, 0x00));
    expect(result).toEqual({ ext: "jpeg", mimeType: "image/jpeg" });
  });

  it("identifies PNG from 89 50 4E 47 0D 0A 1A 0A magic bytes", () => {
    const result = sniffUploadType(
      buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    );
    expect(result).toEqual({ ext: "png", mimeType: "image/png" });
  });

  it("identifies GIF from GIF8 magic bytes", () => {
    const result = sniffUploadType(buf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61));
    expect(result).toEqual({ ext: "gif", mimeType: "image/gif" });
  });

  it("identifies WebP from RIFF....WEBP magic bytes", () => {
    const result = sniffUploadType(
      buf(
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (ignored)
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
      ),
    );
    expect(result).toEqual({ ext: "webp", mimeType: "image/webp" });
  });

  it("identifies PDF from %PDF magic bytes", () => {
    const result = sniffUploadType(buf(0x25, 0x50, 0x44, 0x46, 0x2d));
    expect(result).toEqual({ ext: "pdf", mimeType: "application/pdf" });
  });

  it("returns null for ELF executable magic bytes (7F 45 4C 46)", () => {
    const result = sniffUploadType(buf(0x7f, 0x45, 0x4c, 0x46, 0x00));
    expect(result).toBeNull();
  });

  it("returns null for an all-zero buffer", () => {
    const result = sniffUploadType(buf(0x00, 0x00, 0x00, 0x00));
    expect(result).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    const result = sniffUploadType(new ArrayBuffer(0));
    expect(result).toBeNull();
  });

  it("returns null for RIFF header without WEBP signature (e.g. WAV file)", () => {
    const result = sniffUploadType(
      buf(
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00,
        0x57,
        0x41,
        0x56,
        0x45, // WAVE (not WEBP)
      ),
    );
    expect(result).toBeNull();
  });

  it("returns null for a RIFF header that is too short to check WEBP offset", () => {
    // Buffer is only 8 bytes — not enough to read bytes 8-11 for WEBP check
    const result = sniffUploadType(
      buf(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00),
    );
    expect(result).toBeNull();
  });

  it("returns null for a PNG that is too short (fewer than 8 bytes)", () => {
    // PNG needs 8 bytes for its signature; a 4-byte buffer is too short
    const result = sniffUploadType(buf(0x89, 0x50, 0x4e, 0x47));
    expect(result).toBeNull();
  });
});

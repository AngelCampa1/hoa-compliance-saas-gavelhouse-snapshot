/**
 * Maximum allowed upload size for governance binary attachments (photos and
 * arch-request attachments). Enforced via Content-Length header before the
 * body is read, and again on the actual byte count after the body is read.
 * 10 MB is consistent with the bank/statements MAX_CSV_BYTES convention noted
 * in the defect inventory.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Image-only allow-list. Used by endpoints that accept photos (e.g. violation
 * photos), which must reject PDFs and other document types.
 */
export const IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Full allow-list including PDF. Used by endpoints that accept documents
 * (e.g. architectural-request attachments).
 */
export const DOCUMENT_CONTENT_TYPES: ReadonlySet<string> = new Set([
  ...IMAGE_CONTENT_TYPES,
  "application/pdf",
]);

export function validateUploadContentType(
  contentType: string,
  allowed: ReadonlySet<string> = DOCUMENT_CONTENT_TYPES,
): boolean {
  return allowed.has(contentType);
}

/**
 * Magic-byte signatures for allowed upload types.
 * Each entry has a `magic` byte sequence and the canonical extension to use.
 * The sniff uses only the leading bytes of the uploaded buffer, so the
 * Content-Type header is only used to gate access to the upload endpoint — the
 * actual stored extension always comes from magic bytes.
 */
const MAGIC_SIGNATURES: ReadonlyArray<{
  magic: ReadonlyArray<number>;
  ext: string;
  mimeType: string;
}> = [
  // JPEG: FF D8 FF
  { magic: [0xff, 0xd8, 0xff], ext: "jpeg", mimeType: "image/jpeg" },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ext: "png",
    mimeType: "image/png",
  },
  // GIF: GIF87a or GIF89a
  { magic: [0x47, 0x49, 0x46, 0x38], ext: "gif", mimeType: "image/gif" },
  // WebP: RIFF????WEBP — check bytes 0-3 (RIFF) and 8-11 (WEBP)
  { magic: [0x52, 0x49, 0x46, 0x46], ext: "webp", mimeType: "image/webp" },
  // PDF: %PDF
  {
    magic: [0x25, 0x50, 0x44, 0x46],
    ext: "pdf",
    mimeType: "application/pdf",
  },
];

/**
 * Sniff the leading bytes of `buffer` and return the canonical extension and
 * MIME type if they match a known allowed type. Returns `null` if no allowed
 * signature is found (caller should reject with 415).
 */
export function sniffUploadType(
  buffer: ArrayBuffer,
  allowed: ReadonlySet<string> = DOCUMENT_CONTENT_TYPES,
): { ext: string; mimeType: string } | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));

  for (const sig of MAGIC_SIGNATURES) {
    if (!allowed.has(sig.mimeType)) continue;

    if (sig.ext === "webp") {
      // WebP has RIFF at 0 and WEBP at offset 8
      if (bytes.byteLength < 12) continue;
      const riff = sig.magic;
      const webp = [0x57, 0x45, 0x42, 0x50];
      const matchRiff = riff.every((b, i) => bytes[i] === b);
      const matchWebp = webp.every((b, i) => bytes[8 + i] === b);
      if (matchRiff && matchWebp)
        return { ext: sig.ext, mimeType: sig.mimeType };
      continue;
    }

    if (bytes.byteLength < sig.magic.length) continue;
    if (sig.magic.every((b, i) => bytes[i] === b)) {
      return { ext: sig.ext, mimeType: sig.mimeType };
    }
  }

  return null;
}

export function buildR2Key(
  communityId: string,
  entityType: string,
  entityId: string,
  filename: string,
): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_");
  return `${communityId}/${entityType}/${entityId}/${safe}`;
}

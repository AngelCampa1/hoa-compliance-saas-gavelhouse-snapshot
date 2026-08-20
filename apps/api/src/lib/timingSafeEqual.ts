/**
 * Constant-time string equality comparison.
 *
 * Prevents timing-based side-channel attacks when comparing secrets such as
 * HMAC signatures or session tokens. Both strings are always compared in full
 * regardless of where they first differ.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  // Length mismatch returns immediately. For our callers the expected value is
  // a fixed-length HMAC-SHA256 hex string (64 chars), so its length is public
  // and the early return leaks nothing secret. This mirrors the web signing
  // helper (apps/web/src/lib/ai-sdr/signing.ts) and avoids relying on
  // charCodeAt returning NaN for out-of-range indices to mask a length diff.
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

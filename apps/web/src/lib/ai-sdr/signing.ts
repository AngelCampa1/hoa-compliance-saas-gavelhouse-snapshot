// AI-SDR HMAC signing primitives for the Gavelhouse marketing worker.
//
// These mirror the upstream `@ventora/ai-sdr-worker` verifier byte-for-byte so
// the signed request/response hashes agree exactly. In particular `stableJson`
// sorts object keys by UTF-16 code units (matching the upstream
// `Object.keys().sort()` ordering, NOT locale-aware ordering) and omits
// `undefined` children the same way `JSON.stringify` does.
//
// Web Crypto is used throughout because the Node `crypto` sync path does not
// run on Cloudflare's workerd runtime.

export const AI_SDR_MAX_SKEW_MS = 5 * 60 * 1000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    // Sort by UTF-16 code units to match the upstream verifier's
    // Object.keys().sort() ordering exactly, so the signed body hash agrees
    // byte-for-byte for any key shape.
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(digest);
}

export async function hmacHex(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(signature);
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export async function buildAiSdrPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

export async function verifyAiSdrSignature(input: {
  payload: string;
  signature: string;
  secret: string;
  timestamp: string;
}): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(input.signature)) return false;
  const parsedTimestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(parsedTimestamp)) return false;
  if (Math.abs(Date.now() - parsedTimestamp) > AI_SDR_MAX_SKEW_MS) return false;
  return timingSafeEqual(
    await hmacHex(input.payload, input.secret),
    input.signature,
  );
}

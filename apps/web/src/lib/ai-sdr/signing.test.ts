import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_SDR_MAX_SKEW_MS,
  buildAiSdrPayload,
  hmacHex,
  isRecord,
  sha256Hex,
  stableJson,
  timingSafeEqual,
  verifyAiSdrSignature,
} from "./signing";

const SECRET =
  "42ede44dc88480eb4ada0d3b94bc2ea3cb294ff0734cf272f8c9ea305e0d52bf";

afterEach(() => {
  vi.useRealTimers();
});

describe("stableJson", () => {
  it("sorts object keys by UTF-16 code units, not locale order", () => {
    // Uppercase letters sort before lowercase under code-unit ordering.
    expect(stableJson({ b: 1, A: 2, a: 3 })).toBe('{"A":2,"a":3,"b":1}');
  });

  it("orders keys recursively and serializes arrays in place", () => {
    expect(stableJson({ z: [3, 2, 1], a: { y: 1, x: 2 } })).toBe(
      '{"a":{"x":2,"y":1},"z":[3,2,1]}',
    );
  });

  it("omits undefined object members like JSON.stringify does", () => {
    expect(stableJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("serializes primitives via JSON.stringify", () => {
    expect(stableJson("x")).toBe('"x"');
    expect(stableJson(42)).toBe("42");
    expect(stableJson(null)).toBe("null");
    expect(stableJson(true)).toBe("true");
  });
});

describe("isRecord", () => {
  it("accepts plain objects and rejects arrays/null/primitives", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("sha256Hex / hmacHex", () => {
  it("produces lowercase 64-hex digests", async () => {
    const digest = await sha256Hex("hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // Known SHA-256("hello").
    expect(digest).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces a stable 64-hex HMAC for a fixed payload+secret", async () => {
    const signature = await hmacHex("payload", SECRET);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacHex("payload", SECRET)).toBe(signature);
    expect(await hmacHex("payload2", SECRET)).not.toBe(signature);
  });
});

describe("timingSafeEqual", () => {
  it("returns true only for equal-length equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("buildAiSdrPayload", () => {
  it("formats timestamp.nonce.METHOD.path.bodyHash with an uppercased method", async () => {
    const payload = await buildAiSdrPayload({
      timestamp: "2026-06-01T00:00:00.000Z",
      nonce: "n1",
      method: "post",
      path: "/v1/sessions",
      body: { productId: "gavelhouse" },
    });
    const expectedHash = await sha256Hex(
      stableJson({ productId: "gavelhouse" }),
    );
    expect(payload).toBe(
      `2026-06-01T00:00:00.000Z.n1.POST./v1/sessions.${expectedHash}`,
    );
  });
});

describe("verifyAiSdrSignature", () => {
  it("verifies a freshly minted signature for the same payload+secret", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const timestamp = "2026-06-01T00:00:00.000Z";
    const payload = await buildAiSdrPayload({
      timestamp,
      nonce: "n",
      method: "GET",
      path: "/api/ai-sdr/context?productId=gavelhouse",
      body: { productId: "gavelhouse" },
    });
    const signature = await hmacHex(payload, SECRET);
    expect(
      await verifyAiSdrSignature({
        payload,
        signature,
        secret: SECRET,
        timestamp,
      }),
    ).toBe(true);
  });

  it("rejects signatures that are not 64 lowercase hex chars", async () => {
    expect(
      await verifyAiSdrSignature({
        payload: "p",
        signature: "NOTHEX",
        secret: SECRET,
        timestamp: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects non-parseable timestamps", async () => {
    const payload = "p";
    const signature = await hmacHex(payload, SECRET);
    expect(
      await verifyAiSdrSignature({
        payload,
        signature,
        secret: SECRET,
        timestamp: "not-a-date",
      }),
    ).toBe(false);
  });

  it("rejects timestamps beyond the max skew window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const timestamp = new Date(
      Date.now() - AI_SDR_MAX_SKEW_MS - 1000,
    ).toISOString();
    const payload = await buildAiSdrPayload({
      timestamp,
      nonce: "n",
      method: "GET",
      path: "/p",
      body: {},
    });
    const signature = await hmacHex(payload, SECRET);
    expect(
      await verifyAiSdrSignature({
        payload,
        signature,
        secret: SECRET,
        timestamp,
      }),
    ).toBe(false);
  });

  it("rejects a valid-shaped signature that does not match the payload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const timestamp = "2026-06-01T00:00:00.000Z";
    const signature = await hmacHex("a-different-payload", SECRET);
    expect(
      await verifyAiSdrSignature({
        payload: "the-real-payload",
        signature,
        secret: SECRET,
        timestamp,
      }),
    ).toBe(false);
  });
});

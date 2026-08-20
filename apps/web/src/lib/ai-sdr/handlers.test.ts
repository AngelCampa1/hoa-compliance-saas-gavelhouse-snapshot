import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiSdrContext } from "./context";
import {
  AI_SDR_CONTEXT_PATH,
  handleAiSdrContext,
  handleAiSdrProxy,
  routeAiSdr,
} from "./handlers";
import {
  buildAiSdrPayload,
  hmacHex,
  stableJson,
  verifyAiSdrSignature,
} from "./signing";

const CONTEXT_SECRET =
  "42ede44dc88480eb4ada0d3b94bc2ea3cb294ff0734cf272f8c9ea305e0d52bf";
const ASSERTION_SECRET =
  "4f732ac93e8a1d41d35e403c62a2d1836e7e96b35ecb2e4ed50578ea269ef8c4";
const WORKER_URL = "https://ventora-ai-sdr-worker.example.workers.dev";
const ORIGIN = "https://gavelhouse.app";
const CONTEXT_URL = `https://gavelhouse.app${AI_SDR_CONTEXT_PATH}?productId=gavelhouse`;

async function signedContextRequest(secret: string): Promise<Request> {
  const url = new URL(CONTEXT_URL);
  const timestamp = new Date().toISOString();
  const nonce = "req-nonce";
  const path = `${url.pathname}${url.search}`;
  const payload = await buildAiSdrPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId: "gavelhouse" },
  });
  const signature = await hmacHex(payload, secret);
  return new Request(CONTEXT_URL, {
    headers: {
      "X-Ventora-Timestamp": timestamp,
      "X-Ventora-Nonce": nonce,
      "X-Ventora-Signature": signature,
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("handleAiSdrContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("returns 404 when the productId does not match", async () => {
    const response = await handleAiSdrContext(
      new Request("https://gavelhouse.app/api/ai-sdr/context?productId=other"),
      { AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET },
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 when no productId is supplied", async () => {
    const response = await handleAiSdrContext(
      new Request("https://gavelhouse.app/api/ai-sdr/context"),
      { AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET },
    );
    expect(response.status).toBe(404);
  });

  it("returns 503 when the context secret is not configured", async () => {
    const response = await handleAiSdrContext(new Request(CONTEXT_URL), {});
    expect(response.status).toBe(503);
  });

  it("returns 401 when signature headers are missing", async () => {
    const response = await handleAiSdrContext(new Request(CONTEXT_URL), {
      AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET,
    });
    expect(response.status).toBe(401);
  });

  it("returns 401 when the request signature is invalid", async () => {
    const request = await signedContextRequest("the-wrong-secret");
    const response = await handleAiSdrContext(request, {
      AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET,
    });
    expect(response.status).toBe(401);
  });

  it("accepts product_id as an alternate query key", async () => {
    const altUrl =
      "https://gavelhouse.app/api/ai-sdr/context?product_id=gavelhouse";
    const url = new URL(altUrl);
    const timestamp = new Date().toISOString();
    const nonce = "n";
    const payload = await buildAiSdrPayload({
      timestamp,
      nonce,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      body: { productId: "gavelhouse" },
    });
    const signature = await hmacHex(payload, CONTEXT_SECRET);
    const response = await handleAiSdrContext(
      new Request(altUrl, {
        headers: {
          "X-Ventora-Timestamp": timestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": signature,
        },
      }),
      { AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET },
    );
    expect(response.status).toBe(200);
  });

  it("returns the signed context whose response signature verifies against the path-with-search", async () => {
    const request = await signedContextRequest(CONTEXT_SECRET);
    const response = await handleAiSdrContext(request, {
      AI_SDR_CONTEXT_SECRET: CONTEXT_SECRET,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");

    const body = await response.json();
    expect(body).toEqual(buildAiSdrContext());

    const respTimestamp = response.headers.get("X-Ventora-Timestamp") ?? "";
    const respNonce = response.headers.get("X-Ventora-Nonce") ?? "";
    const respSignature = response.headers.get("X-Ventora-Signature") ?? "";
    const url = new URL(CONTEXT_URL);
    const expectedPayload = await buildAiSdrPayload({
      timestamp: respTimestamp,
      nonce: respNonce,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      body: body as Record<string, unknown>,
    });
    expect(
      await verifyAiSdrSignature({
        payload: expectedPayload,
        signature: respSignature,
        secret: CONTEXT_SECRET,
        timestamp: respTimestamp,
      }),
    ).toBe(true);
  });
});

describe("handleAiSdrProxy", () => {
  const fullEnv = {
    AI_SDR_CLIENT_ASSERTION_SECRET: ASSERTION_SECRET,
    AI_SDR_WORKER_URL: WORKER_URL,
  };

  it("rejects non-POST methods with 405", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "GET",
      }),
      fullEnv,
      "/v1/sessions",
    );
    expect(response.status).toBe(405);
  });

  it("rejects requests from a disallowed origin with 403", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: "https://evil.example.com" },
        body: JSON.stringify({ productId: "gavelhouse" }),
      }),
      fullEnv,
      "/v1/sessions",
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 when the Origin header is absent", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        body: JSON.stringify({ productId: "gavelhouse" }),
      }),
      fullEnv,
      "/v1/sessions",
    );
    expect(response.status).toBe(403);
  });

  it("omits Content-Type when the upstream response has none", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/handoff", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1" }),
      }),
      fullEnv,
      "/v1/handoff",
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Content-Type")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when the worker URL or secret is missing", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: ORIGIN },
        body: JSON.stringify({ productId: "gavelhouse" }),
      }),
      {},
      "/v1/sessions",
    );
    expect(response.status).toBe(503);
  });

  it("returns 503 when the worker URL is not https", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: ORIGIN },
        body: JSON.stringify({ productId: "gavelhouse" }),
      }),
      { ...fullEnv, AI_SDR_WORKER_URL: "http://insecure.example.com" },
      "/v1/sessions",
    );
    expect(response.status).toBe(503);
  });

  it("returns 400 when the body is not a JSON object", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: "not json",
      }),
      fullEnv,
      "/v1/sessions",
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when the body is a JSON array", async () => {
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify([1, 2, 3]),
      }),
      fullEnv,
      "/v1/sessions",
    );
    expect(response.status).toBe(400);
  });

  it("signs and forwards the request, passing through status and content-type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "s1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = {
      productId: "gavelhouse",
      metadata: { surface: "marketing-site" },
    };
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      fullEnv,
      "/v1/sessions",
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${WORKER_URL}/v1/sessions`);
    const headers = new Headers((init as RequestInit).headers);
    const timestamp = headers.get("X-Ventora-Timestamp") ?? "";
    const nonce = headers.get("X-Ventora-Nonce") ?? "";
    const signature = headers.get("X-Ventora-Signature") ?? "";
    expect(headers.get("Origin")).toBe(ORIGIN);

    const expectedPayload = await buildAiSdrPayload({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sessions",
      body,
    });
    expect(signature).toBe(await hmacHex(expectedPayload, ASSERTION_SECRET));
    // Wire body is JSON.stringify(body); hash is over stableJson(body).
    expect((init as RequestInit).body).toBe(JSON.stringify(body));
    expect(stableJson(body)).not.toBe(JSON.stringify(body));
  });

  it("requests an SSE Accept header for /v1/chat and streams the upstream body", async () => {
    const stream = new ReadableStream();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Retry-After": "5" },
      }),
    );
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/chat", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1", message: "hi" }),
      }),
      fullEnv,
      "/v1/chat",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Retry-After")).toBe("5");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Accept")).toBe("text/event-stream");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const response = await handleAiSdrProxy(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/chat", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1", message: "hi" }),
      }),
      fullEnv,
      "/v1/chat",
    );
    expect(response.status).toBe(502);
  });
});

describe("routeAiSdr", () => {
  it("routes a GET context request to the context handler", async () => {
    const result = routeAiSdr(
      new Request(
        "https://gavelhouse.app/api/ai-sdr/context?productId=gavelhouse",
      ),
      {},
    );
    expect(result).not.toBeNull();
    const response = await result!;
    // No secret configured -> 503 (proves it reached the context handler).
    expect(response.status).toBe(503);
  });

  it("routes each /v1 path to the proxy handler", async () => {
    for (const path of ["sessions", "chat", "handoff"]) {
      const result = routeAiSdr(
        new Request(`https://gavelhouse.app/api/ai-sdr/v1/${path}`, {
          method: "POST",
          headers: { Origin: ORIGIN },
          body: JSON.stringify({ productId: "gavelhouse" }),
        }),
        {},
      );
      expect(result).not.toBeNull();
      const response = await result!;
      expect(response.status).toBe(503);
    }
  });

  it("returns null for a non AI-SDR path so the caller delegates to Astro", () => {
    expect(
      routeAiSdr(new Request("https://gavelhouse.app/pricing/"), {}),
    ).toBeNull();
  });

  it("returns null for a non-GET request to the context path", () => {
    expect(
      routeAiSdr(
        new Request(
          "https://gavelhouse.app/api/ai-sdr/context?productId=gavelhouse",
          {
            method: "POST",
          },
        ),
        {},
      ),
    ).toBeNull();
  });

  it("ignores non-string env bindings when narrowing the env", async () => {
    // AI_SDR_CONTEXT_SECRET is a number here -> readEnv's pick() drops it,
    // so the context handler still fails closed with 503.
    const result = routeAiSdr(
      new Request(
        "https://gavelhouse.app/api/ai-sdr/context?productId=gavelhouse",
      ),
      { AI_SDR_CONTEXT_SECRET: 12345, AI_SDR_WORKER_URL: null },
    );
    const response = await result!;
    expect(response.status).toBe(503);
  });

  it("tolerates a non-object env binding", async () => {
    const result = routeAiSdr(
      new Request(
        "https://gavelhouse.app/api/ai-sdr/context?productId=gavelhouse",
      ),
      undefined,
    );
    const response = await result!;
    expect(response.status).toBe(503);
  });
});

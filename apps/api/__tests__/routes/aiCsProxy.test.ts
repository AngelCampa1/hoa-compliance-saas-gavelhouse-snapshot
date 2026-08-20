import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

const mockGetSession = vi.fn();
const mockFetch = vi.fn();
const mockCaptureEvent = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({ insert: mockInsert })),
}));

const mockSendEscalationNotification = vi.fn();

vi.mock("../../src/lib/aiCsEscalationMailer.js", () => ({
  sendEscalationNotification: (...args: unknown[]) =>
    mockSendEscalationNotification(...args),
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
  captureException: mockCaptureException,
}));

vi.stubGlobal("fetch", mockFetch);

const { default: aiCsProxyRouter, buildAiCsAssertionPayload } =
  await import("../../src/routes/aiCsProxy.js");
const { aiCsEscalations } = await import("../../src/db/schema/index.js");

function env(overrides: Partial<Env> = {}): Env {
  return {
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "http://localhost:8060",
    APP_URL: "https://my.gavelhouse.app",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
    STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
    STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
    STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
    STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
    STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
    STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
    RESEND_API_KEY: "resend_test",
    AI_CS_CLIENT_ASSERTION_SECRET: "ai-cs-secret",
    AI_CS_WORKER_ORIGIN: "https://test-ai-cs-worker.example.workers.dev",
    ...overrides,
  };
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", aiCsProxyRouter);
  return app;
}

function post(path: string, body: unknown, testEnv = env()) {
  return makeApp().request(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://my.gavelhouse.app",
      },
      body: JSON.stringify(body),
    },
    testEnv,
  );
}

describe("AI-CS authenticated BFF (v1 contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "treasurer@example.com" },
    });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
    mockSendEscalationNotification.mockResolvedValue(undefined);
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  });

  it("requires an authenticated dashboard session", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const response = await post("/api/ai-cs/v1/sessions", {});

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fails closed (503) when the client assertion secret is missing", async () => {
    const response = await post(
      "/api/ai-cs/v1/chat",
      { sessionId: "cs_123", message: "Help" },
      env({ AI_CS_CLIENT_ASSERTION_SECRET: undefined }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI support unavailable" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies session, chat, and escalation requests to the AI-CS worker using origin from env", async () => {
    for (const [route] of [
      ["sessions", "session"],
      ["chat", "chat"],
      ["escalations", "escalation"],
    ] as const) {
      const response = await post(`/api/ai-cs/v1/${route}`, {
        sessionId: "cs_123",
        message: "Need help with reserves",
      });

      expect(response.status).toBe(200);
    }

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Origin is read from AI_CS_WORKER_ORIGIN env binding — not hardcoded
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://test-ai-cs-worker.example.workers.dev/v1/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://test-ai-cs-worker.example.workers.dev/v1/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "https://test-ai-cs-worker.example.workers.dev/v1/escalations",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_succeeded",
      {
        action: "session",
        request_field_count: 2,
      },
      "user-1",
      expect.any(Object),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_succeeded",
      {
        action: "chat",
        request_field_count: 2,
      },
      "user-1",
      expect.any(Object),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_succeeded",
      {
        action: "escalation",
        request_field_count: 2,
      },
      "user-1",
      expect.any(Object),
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Need help with reserves");
    expect(calls).not.toContain("treasurer@example.com");
  });

  it("fails closed (503) when AI_CS_WORKER_ORIGIN is not set", async () => {
    const response = await post(
      "/api/ai-cs/v1/sessions",
      {},
      env({ AI_CS_WORKER_ORIGIN: undefined }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI support unavailable" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards sessions, chat, and escalations to the Worker /v1 contract", async () => {
    await post("/api/ai-cs/v1/sessions", {});
    await post("/api/ai-cs/v1/escalations", { sessionId: "cs_1" });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://test-ai-cs-worker.example.workers.dev/v1/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://test-ai-cs-worker.example.workers.dev/v1/escalations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reads the Worker origin from AI_CS_WORKER_ORIGIN", async () => {
    const customOrigin = "https://custom-ai-cs.my-org.workers.dev";
    await post(
      "/api/ai-cs/v1/sessions",
      {},
      env({ AI_CS_WORKER_ORIGIN: customOrigin }),
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${customOrigin}/v1/sessions`);
  });

  it("injects the authenticated identity into session creation, ignoring client identity", async () => {
    await post("/api/ai-cs/v1/sessions", {
      appId: "attacker-app",
      userId: "attacker-user",
      currentPath: "/finance/reserves",
      metadata: { source: "widget" },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body).toEqual({
      appId: "gavelhouse",
      userId: "user-1",
      currentPath: "/finance/reserves",
      metadata: { source: "widget" },
    });
  });

  it("forwards the EXACT canonical bytes it signed (wire body matches the HMAC-committed serialization)", async () => {
    // The X-Ventora-Signature commits to stableJson(forwardBody) — the
    // alphabetically key-sorted serialization. The bytes actually sent over the
    // wire must therefore be that same canonical string, or the upstream Worker
    // re-hashes a differently-ordered body and rejects every request with a
    // signature mismatch. A session body carrying currentPath/metadata is the
    // exposing case: insertion order is appId,userId,currentPath,metadata but
    // canonical order is appId,currentPath,metadata,userId.
    await post("/api/ai-cs/v1/sessions", {
      currentPath: "/finance/reserves",
      metadata: { source: "widget" },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      '{"appId":"gavelhouse","currentPath":"/finance/reserves","metadata":{"source":"widget"},"userId":"user-1"}',
    );
  });

  it("forwards chat bodies unchanged and signs over the worker path", async () => {
    await post("/api/ai-cs/v1/chat", {
      sessionId: "cs_123",
      message: "How do I import a reserve study?",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body).toEqual({
      sessionId: "cs_123",
      message: "How do I import a reserve study?",
    });
    expect(headers.Origin).toBe("https://my.gavelhouse.app");
    expect(headers["X-Ventora-Timestamp"]).toBeTruthy();
    expect(headers["X-Ventora-Nonce"]).toBeTruthy();
    expect(headers["X-Ventora-Signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(headers)).not.toContain("ai-cs-secret");
    expect(init.body as string).not.toContain("ai-cs-secret");
  });

  it("streams the chat SSE response through unbuffered", async () => {
    const sse =
      'event: message.delta\ndata: {"text":"Hi"}\n\n' +
      'event: message.done\ndata: {"messageId":"m1"}\n\n';
    mockFetch.mockResolvedValueOnce(
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await post("/api/ai-cs/v1/chat", {
      sessionId: "cs_123",
      message: "Help",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toBe(sse);
  });

  it("defaults the chat Content-Type to text/event-stream when the Worker omits it", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("event: heartbeat\ndata: {}\n\n"),
        );
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const response = await post("/api/ai-cs/v1/chat", {
      sessionId: "cs_123",
      message: "Help",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns 502 when the chat Worker response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const response = await post("/api/ai-cs/v1/chat", {
      sessionId: "cs_123",
      message: "Help",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AI support unavailable" });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_failed",
      {
        action: "chat",
        failure_type: "upstream_unavailable",
        request_field_count: 2,
      },
      "user-1",
      expect.any(Object),
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("boom");
    expect(calls).not.toContain("Help");
  });

  it("returns 502 when the chat Worker response has no body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await post("/api/ai-cs/v1/chat", {
      sessionId: "cs_123",
      message: "Help",
    });

    expect(response.status).toBe(502);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_failed",
      {
        action: "chat",
        failure_type: "upstream_unavailable",
        request_field_count: 2,
      },
      "user-1",
      expect.any(Object),
    );
  });

  it("rejects non-object JSON bodies without proxying", async () => {
    const response = await post("/api/ai-cs/v1/chat", ["not", "an", "object"]);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies without proxying", async () => {
    const response = await makeApp().request(
      "/api/ai-cs/v1/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not expose upstream response headers for non-chat routes", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "cs_9" }), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "X-Ventora-Signature": "secret-upstream-signature",
        },
      }),
    );

    const response = await post("/api/ai-cs/v1/sessions", {});

    expect(response.status).toBe(201);
    expect(response.headers.get("X-Ventora-Signature")).toBeNull();
    expect(await response.json()).toEqual({ sessionId: "cs_9" });
  });

  it("falls back to the production dashboard origin when request origin and APP_URL are absent", async () => {
    await makeApp().request(
      "/api/ai-cs/v1/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env({ APP_URL: "" }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Origin).toBe("https://gavelhouse.app");
  });

  it("returns a safe error when the Worker fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    const response = await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_123",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AI support unavailable" });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_failed",
      {
        action: "escalation",
        failure_type: "upstream_unavailable",
        request_field_count: 1,
      },
      "user-1",
      expect.any(Object),
    );
  });

  it("returns a safe error when a non-chat Worker response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_123",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AI support unavailable" });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_support_proxy_failed",
      {
        action: "escalation",
        failure_type: "upstream_unavailable",
        request_field_count: 1,
      },
      "user-1",
      expect.any(Object),
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("internal");
  });

  it("builds deterministic assertion payloads for equivalent JSON bodies", async () => {
    await expect(
      buildAiCsAssertionPayload({
        timestamp: "2026-05-15T12:00:00.000Z",
        nonce: "nonce",
        method: "post",
        path: "/v1/chat",
        body: { z: true, a: { b: "value" }, omitted: undefined },
      }),
    ).resolves.toBe(
      await buildAiCsAssertionPayload({
        timestamp: "2026-05-15T12:00:00.000Z",
        nonce: "nonce",
        method: "POST",
        path: "/v1/chat",
        body: { a: { b: "value" }, z: true },
      }),
    );
  });

  it("canonicalizes nested array and primitive values in assertion bodies", async () => {
    const payload = await buildAiCsAssertionPayload({
      timestamp: "2026-05-15T12:00:00.000Z",
      nonce: "nonce",
      method: "POST",
      path: "/v1/chat",
      body: { values: ["a", 1, true, null] },
    });

    expect(payload).toMatch(
      /^2026-05-15T12:00:00\.000Z\.nonce\.POST\.\/v1\/chat\.[a-f0-9]{64}$/,
    );
  });

  it("persists a durable ticket and notifies the team before forwarding an escalation", async () => {
    const callOrder: string[] = [];
    mockValues.mockImplementationOnce(async () => {
      callOrder.push("persist");
    });
    mockSendEscalationNotification.mockImplementationOnce(async () => {
      callOrder.push("email");
    });
    mockFetch.mockImplementationOnce(async () => {
      callOrder.push("forward");
      return new Response(JSON.stringify({ escalationId: "esc_1" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_42",
      reason: "billing",
      message: "I was double charged",
      contact: "treasurer@hoa.example",
    });

    expect(response.status).toBe(202);
    expect(callOrder).toEqual(["persist", "email", "forward"]);
    expect(mockInsert).toHaveBeenCalledWith(aiCsEscalations);
    expect(mockValues).toHaveBeenCalledWith({
      userId: "user-1",
      userEmail: "treasurer@example.com",
      sessionId: "cs_42",
      reason: "billing",
      message: "I was double charged",
      contact: "treasurer@hoa.example",
    });
    expect(mockSendEscalationNotification).toHaveBeenCalledTimes(1);
  });

  it("serializes a non-string contact and defaults absent fields to null", async () => {
    await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_7",
      contact: { email: "a@b.c", phone: "555" },
    });

    expect(mockValues).toHaveBeenCalledWith({
      userId: "user-1",
      userEmail: "treasurer@example.com",
      sessionId: "cs_7",
      reason: null,
      message: null,
      contact: JSON.stringify({ email: "a@b.c", phone: "555" }),
    });
  });

  it("rejects an escalation missing a sessionId without persisting or forwarding", async () => {
    const response = await post("/api/ai-cs/v1/escalations", {
      reason: "no-session",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSendEscalationNotification).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("still forwards the escalation when persistence fails", async () => {
    mockValues.mockRejectedValueOnce(new Error("db offline"));

    const response = await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_8",
    });

    expect(response.status).toBe(200);
    expect(mockSendEscalationNotification).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("still forwards the escalation when the notification email fails", async () => {
    mockSendEscalationNotification.mockRejectedValueOnce(
      new Error("resend down"),
    );

    const response = await post("/api/ai-cs/v1/escalations", {
      sessionId: "cs_9",
    });

    expect(response.status).toBe(200);
    expect(mockValues).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

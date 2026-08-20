import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

const mockHandler = vi
  .fn()
  .mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

vi.mock("../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    handler: mockHandler,
    api: { getSession: vi.fn().mockResolvedValue(null) },
  })),
  getAuth: vi.fn(() => ({
    handler: mockHandler,
    api: { getSession: vi.fn().mockResolvedValue(null) },
  })),
  getAuthProviders: vi.fn(() => ({ google: true })),
}));

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({})),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../src/lib/rateLimiter.js", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
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
};

const authModule = await import("../../src/routes/auth.js");
const authRouter = authModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", authRouter);
  return app;
}

describe("auth route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    // Default: rate limit allows all requests
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  it("delegates /api/auth/* requests to auth.handler", async () => {
    const req = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
    });
    const res = await makeApp().fetch(req, mockEnv);
    expect(mockHandler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("delegates GET /api/auth/session to auth.handler", async () => {
    const req = new Request("http://localhost/api/auth/session", {
      method: "GET",
    });
    await makeApp().fetch(req, mockEnv);
    expect(mockHandler).toHaveBeenCalled();
  });

  it("delegates POST /api/auth/sign-up/email to auth.handler", async () => {
    const req = new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        email: "t@t.com",
        password: "Test1234!",
      }),
    });
    const res = await makeApp().fetch(req, mockEnv);
    expect(mockHandler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns configured auth provider availability", async () => {
    const req = new Request("http://localhost/api/auth/providers", {
      method: "GET",
    });
    const res = await makeApp().fetch(req, mockEnv);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ google: true });
  });

  it("does NOT match bare /auth/* paths (client SDK uses /api/auth/*)", async () => {
    mockHandler.mockClear();
    const req = new Request("http://localhost/auth/sign-in", {
      method: "POST",
    });
    await makeApp().fetch(req, mockEnv);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 429 when IP rate limit is exceeded on sign-in", async () => {
    // First checkRateLimit call (IP) returns not allowed
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });

    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "1.2.3.4",
      },
      body: JSON.stringify({ email: "test@example.com", password: "pass" }),
    });
    const res = await makeApp().fetch(req, mockEnv);

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Too many requests");
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 429 when email rate limit is exceeded on sign-in", async () => {
    // IP check passes, email check fails
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 4 }) // IP check
      .mockResolvedValueOnce({ allowed: false, remaining: 0 }); // email check

    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "pass" }),
    });
    const res = await makeApp().fetch(req, mockEnv);

    expect(res.status).toBe(429);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("skips email rate limit when body has no email field", async () => {
    // Only one rate limit call (IP only) since no email in body
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 4 });

    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-token" }), // no email field
    });
    const res = await makeApp().fetch(req, mockEnv);

    // Should pass through to the handler (not blocked)
    expect(res.status).toBe(200);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1); // only IP check
  });

  it("does not use x-forwarded-for as rate-limit key (spoofable header must be ignored)", async () => {
    // IP check must use cf-connecting-ip only. A spoofed x-forwarded-for header
    // must not become the rate-limit key — if it did, an attacker could supply
    // arbitrary IPs to bypass per-IP limits.
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });

    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Spoofed header that should be completely ignored
        "x-forwarded-for": "9.8.7.6",
        // Real Cloudflare header (absent — should fall back to "unknown")
      },
      body: JSON.stringify({ email: "test@example.com", password: "pass" }),
    });
    await makeApp().fetch(req, mockEnv);

    // The rate-limit identifier passed to checkRateLimit for IP must be
    // "unknown" (from missing cf-connecting-ip), NOT the spoofed value.
    const ipCallArgs = mockCheckRateLimit.mock.calls.find(
      (callArgs) =>
        (callArgs[0] as { namespace: string }).namespace === "auth-ip",
    );
    expect(ipCallArgs).toBeDefined();
    expect((ipCallArgs![0] as { identifier: string }).identifier).toBe(
      "unknown",
    );
    expect((ipCallArgs![0] as { identifier: string }).identifier).not.toBe(
      "9.8.7.6",
    );
  });

  it("does not apply rate limiting to non-rate-limited auth paths", async () => {
    const req = new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await makeApp().fetch(req, mockEnv);

    expect(res.status).toBe(200);
    // Rate limiter should not be called for non-rate-limited paths
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});

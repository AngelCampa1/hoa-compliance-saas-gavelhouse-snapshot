import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";
import { feedbackSubmissions } from "../../src/db/schema/index.js";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

const mockEnv: Env = {
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
  DATABASE_URL: "postgres://localhost/test",
};

const mockGetSession = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
  })),
}));

const mockCaptureEvent = vi.fn();

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------

const { default: feedbackRouter } =
  await import("../../src/routes/feedback.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", feedbackRouter);
  return app;
}

function post(path: string, body: unknown, env: Env = mockEnv) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return makeApp().fetch(req, env);
}

const validBody = {
  category: "bug",
  message: "Something is broken",
  pageUrl: "https://my.gavelhouse.app/dashboard",
};

function mockAuth(userId = "user-123") {
  mockGetSession.mockResolvedValueOnce({
    user: { id: userId, email: "test@example.com" },
  });
}

function mockDb() {
  mockValues.mockResolvedValueOnce([]);
  mockInsert.mockReturnValueOnce({ values: mockValues });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Auth ---

  it("returns 401 when the request has no session", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await post("/api/feedback", validBody);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("does not insert when unauthenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await post("/api/feedback", validBody);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // --- Validation ---

  it("returns 400 when category is missing", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      message: "Hello",
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is not an allowed value", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "complaint",
      message: "Hello",
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is empty", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "idea",
      message: "",
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when message exceeds 2000 chars", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "idea",
      message: "x".repeat(2001),
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when pageUrl is not a valid URL", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "other",
      message: "Hello",
      pageUrl: "not-a-url",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when pageUrl points at an external origin", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "bug",
      message: "Something is broken",
      pageUrl: "https://evil.example/dashboard",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "pageUrl origin is not allowed",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 when APP_URL is not configured", async () => {
    mockAuth();
    const envWithoutAppUrl = { ...mockEnv } as Partial<Env> as Env;
    delete (envWithoutAppUrl as Partial<Env>).APP_URL;
    const res = await post("/api/feedback", validBody, envWithoutAppUrl);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "pageUrl origin is not allowed",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 when pageUrl is missing", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "other",
      message: "Hello",
    });
    expect(res.status).toBe(400);
  });

  // --- Happy path ---

  it("returns 200 with ok:true on valid bug submission", async () => {
    mockAuth();
    mockDb();
    const res = await post("/api/feedback", validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("accepts all three valid categories", async () => {
    for (const category of ["bug", "idea", "other"] as const) {
      mockAuth();
      mockDb();
      const res = await post("/api/feedback", { ...validBody, category });
      expect(res.status).toBe(200);
    }
  });

  it("inserts a row with the correct fields", async () => {
    mockAuth("user-abc");
    mockDb();
    await post("/api/feedback", {
      category: "idea",
      message: "Would love board packet exports",
      pageUrl: "https://my.gavelhouse.app/settings",
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledWith(feedbackSubmissions);
    expect(mockValues).toHaveBeenCalledWith({
      userId: "user-abc",
      category: "idea",
      message: "Would love board packet exports",
      pageUrl: "https://my.gavelhouse.app/settings",
    });
  });

  it("fires a PostHog feedback_submitted event after inserting", async () => {
    mockAuth("user-xyz");
    mockDb();
    mockCaptureEvent.mockResolvedValueOnce(undefined);

    await post("/api/feedback", {
      category: "other",
      message: "General feedback",
      pageUrl:
        "https://my.gavelhouse.app/dashboard?token=secret&email=owner@example.com#section",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "feedback_submitted",
      { category: "other", page_path: "/dashboard" },
      "user-xyz",
      mockEnv,
    );
  });

  it("still returns 200 when PostHog capture throws", async () => {
    mockAuth();
    mockDb();
    mockCaptureEvent.mockRejectedValueOnce(new Error("PostHog down"));
    const res = await post("/api/feedback", validBody);
    expect(res.status).toBe(200);
  });

  it("trims whitespace-only messages via Zod min(1) after trim", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "bug",
      message: "",
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
    expect(res.status).toBe(400);
  });

  it("accepts a message exactly 2000 chars long", async () => {
    mockAuth();
    mockDb();
    const res = await post("/api/feedback", {
      ...validBody,
      message: "x".repeat(2000),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when pageUrl exceeds 2048 characters", async () => {
    mockAuth();
    const res = await post("/api/feedback", {
      category: "bug",
      message: "Hello",
      pageUrl: "https://my.gavelhouse.app/" + "a".repeat(2030),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a pageUrl exactly 2048 characters long", async () => {
    mockAuth();
    mockDb();
    // Build a URL exactly 2048 chars: base is 27 chars, pad to 2048.
    const base = "https://my.gavelhouse.app/";
    const pageUrl = base + "a".repeat(2048 - base.length);
    expect(pageUrl.length).toBe(2048);
    const res = await post("/api/feedback", {
      category: "bug",
      message: "Hello",
      pageUrl,
    });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockAuth();
    mockValues.mockRejectedValueOnce(new Error("DB connection lost"));
    mockInsert.mockReturnValueOnce({ values: mockValues });
    const res = await post("/api/feedback", validBody);
    expect(res.status).toBe(500);
  });
});

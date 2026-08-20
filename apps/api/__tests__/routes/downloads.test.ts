import { beforeEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";
import { buildSignedLeadMagnetDownloadUrl } from "../../src/lib/leadMagnetDownloads.js";

const mockCaptureEvent = vi.fn();

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const downloadsModule = await import("../../src/routes/downloads.js");
const downloadsRouter = downloadsModule.default;

class MockR2ObjectBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly httpEtag: string | undefined;

  constructor(body: string, httpEtag = '"etag-test"') {
    this.httpEtag = httpEtag;
    this.body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
  }
}

type MockBucket = Pick<R2Bucket, "get">;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", downloadsRouter);
  return app;
}

function makeEnv(get: MockBucket["get"]): Env {
  return {
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
    LEAD_MAGNET_DOWNLOAD_SECRET: "test-download-secret",
    PUBLIC_API_URL: "https://api.gavelhouse.app",
    LEAD_MAGNETS_BUCKET: { get } as R2Bucket,
  };
}

async function signedPath(
  slug: string,
  env: Env,
  // Sign relative to the real current time so the 30-day signature is always
  // valid when the suite runs. A fixed calendar date would silently expire
  // (the route verifies against real `new Date()`), making these tests a
  // date-bomb. The expired-signature case below passes an explicit past date.
  now = new Date(),
): Promise<string> {
  const url = await buildSignedLeadMagnetDownloadUrl({
    slug,
    env,
    now,
  });
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

describe("GET /downloads/:slug.pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockResolvedValue(undefined);
  });

  it("streams a valid signed PDF from R2", async () => {
    const env = makeEnv(async (key: string) => {
      expect(key).toBe("reserve-fund-calculator.pdf");
      return new MockR2ObjectBody("%PDF-1.7\nbody") as unknown as R2ObjectBody;
    });
    const path = await signedPath("reserve-fund-calculator", env);

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reserve-fund-calculator.pdf"',
    );
    expect(res.headers.get("ETag")).toBe('"etag-test"');
    expect(await res.text()).toContain("%PDF-1.7");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_downloaded",
      {
        content_slug: "reserve-fund-calculator",
      },
      undefined,
      env,
    );
  });

  it("rejects an unknown slug", async () => {
    const env = makeEnv(async () => null);
    const res = await makeApp().request(
      "/downloads/not-a-real-slug.pdf?expires=1770000000&signature=abc",
      {},
      env,
    );

    expect(res.status).toBe(404);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        failure_type: "invalid_filename",
      },
      undefined,
      env,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("not-a-real-slug");
    expect(calls).not.toContain("signature");
  });

  it("rejects a non-PDF filename", async () => {
    const env = makeEnv(async () => null);
    const res = await makeApp().request(
      "/downloads/reserve-fund-calculator.txt?expires=1770000000&signature=abc",
      {},
      env,
    );

    expect(res.status).toBe(404);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        failure_type: "invalid_filename",
      },
      undefined,
      env,
    );
  });

  it("rejects missing signature query params", async () => {
    const env = makeEnv(async () => new MockR2ObjectBody("%PDF") as never);
    const res = await makeApp().request(
      "/downloads/reserve-fund-calculator.pdf",
      {},
      env,
    );

    expect(res.status).toBe(403);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        content_slug: "reserve-fund-calculator",
        failure_type: "invalid_signature",
      },
      undefined,
      env,
    );
  });

  it("rejects an expired signature", async () => {
    const env = makeEnv(async () => new MockR2ObjectBody("%PDF") as never);
    const path = await signedPath(
      "reserve-fund-calculator",
      env,
      new Date("2025-01-01T00:00:00.000Z"),
    );

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(403);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        content_slug: "reserve-fund-calculator",
        failure_type: "invalid_signature",
      },
      undefined,
      env,
    );
  });

  it("rejects a bad signature", async () => {
    const env = makeEnv(async () => new MockR2ObjectBody("%PDF") as never);
    const path = await signedPath("reserve-fund-calculator", env);
    const url = new URL(`https://api.gavelhouse.app${path}`);
    url.searchParams.set("signature", "0".repeat(64));

    const res = await makeApp().request(
      `${url.pathname}${url.search}`,
      {},
      env,
    );

    expect(res.status).toBe(403);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        content_slug: "reserve-fund-calculator",
        failure_type: "invalid_signature",
      },
      undefined,
      env,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("000000");
  });

  it("returns 404 when the R2 object is missing", async () => {
    const env = makeEnv(async () => null);
    const path = await signedPath("reserve-fund-calculator", env);

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(404);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        content_slug: "reserve-fund-calculator",
        failure_type: "missing_object",
      },
      undefined,
      env,
    );
  });

  it("still streams a valid PDF when analytics capture fails", async () => {
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));
    const env = makeEnv(
      async () => new MockR2ObjectBody("%PDF-1.7\nbody") as never,
    );
    const path = await signedPath("reserve-fund-calculator", env);

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("%PDF-1.7");
  });

  it("streams a valid PDF when R2 does not return an ETag", async () => {
    const env = makeEnv(
      async () => new MockR2ObjectBody("%PDF-1.7\nbody", "") as never,
    );
    const path = await signedPath("reserve-fund-calculator", env);

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.has("ETag")).toBe(false);
  });

  it("returns 503 when the bucket binding is missing", async () => {
    const env = makeEnv(async () => null);
    env.LEAD_MAGNETS_BUCKET = undefined;
    const path = await signedPath("reserve-fund-calculator", env);

    const res = await makeApp().request(path, {}, env);

    expect(res.status).toBe(503);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_magnet_download_failed",
      {
        content_slug: "reserve-fund-calculator",
        failure_type: "bucket_not_configured",
      },
      undefined,
      env,
    );
  });
});

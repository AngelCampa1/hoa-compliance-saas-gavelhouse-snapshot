import { describe, it, expect, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  app,
  buildAllowedOrigins,
  buildSentryOptions,
  getIntentionalErrorResponse,
  handleAppError,
} from "../src/index.js";
import { buildSignedLeadMagnetDownloadUrl } from "../src/lib/leadMagnetDownloads.js";
import { captureEvent, captureException } from "../src/lib/observability.js";
import type { Env } from "../src/types/env.js";

vi.mock("../src/lib/observability.js", () => ({
  initSentry: vi.fn(() => undefined),
  captureException: vi.fn(() => "event-api-123"),
  captureEvent: vi.fn().mockResolvedValue(undefined),
  buildInternalErrorBody: vi.fn((trackingId?: string) => ({
    error: "Something went wrong. Please try again.",
    ...(trackingId ? { trackingId } : {}),
  })),
}));

// Register a throwing route at module-load time so the Hono matcher is not
// yet sealed when this line runs (route registration must happen before the
// first app.request() call compiles the router).
app.get("/test-error-route", () => {
  throw new Error("boom");
});

describe("GET /health", () => {
  it("returns 200 with ok: true and version: '1'", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, version: "1", commit: "dev" });
  });

  it("stays available when production shutdown mode is enabled", async () => {
    const res = await app.request("/health", {}, {
      GAVELHOUSE_SHUTDOWN: "true",
    } as Env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      version: "1",
      commit: "dev",
    });
  });
});

describe("shutdown mode", () => {
  it("returns 410 for product API routes", async () => {
    const res = await app.request("/billing/status?communityId=c1", {}, {
      GAVELHOUSE_SHUTDOWN: "true",
    } as Env);

    expect(res.status).toBe(410);
    expect(res.headers.get("X-Gavelhouse-Shutdown")).toBe("true");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      error: "Gavelhouse has been shut down.",
      code: "gavelhouse_shutdown",
    });
  });
});

describe("CORS", () => {
  it("allows requests from https://gavelhouse.app", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://gavelhouse.app" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://gavelhouse.app",
    );
  });

  it("does not echo disallowed origins", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://evil.example.com" },
    });
    const allowedOrigin = res.headers.get("Access-Control-Allow-Origin");
    expect(allowedOrigin).not.toBe("https://evil.example.com");
  });
});

describe("buildAllowedOrigins", () => {
  it("includes localhost origins when env bindings are absent", () => {
    expect(buildAllowedOrigins()).toEqual([
      "https://gavelhouse.app",
      "https://my.gavelhouse.app",
      "http://localhost:3060",
      "http://localhost:3061",
    ]);
  });

  it("limits to production origins when app and auth URLs are production", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.gavelhouse.app",
        BETTER_AUTH_URL: "https://api.gavelhouse.app",
      }),
    ).toEqual(["https://gavelhouse.app", "https://my.gavelhouse.app"]);
  });

  it("limits to production origins when Sentry environment is production", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "http://localhost:3060",
        BETTER_AUTH_URL: "http://localhost:8060",
        SENTRY_ENVIRONMENT: "production",
      }),
    ).toEqual(["https://gavelhouse.app", "https://my.gavelhouse.app"]);
  });

  it("includes localhost origins for non-production app/auth URLs", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "http://localhost:3060",
        BETTER_AUTH_URL: "http://localhost:8060",
      }),
    ).toEqual([
      "https://gavelhouse.app",
      "https://my.gavelhouse.app",
      "http://localhost:3060",
      "http://localhost:3061",
    ]);
  });

  it("includes localhost origins when only the app URL is non-production", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "http://localhost:3060",
        BETTER_AUTH_URL: "https://api.gavelhouse.app",
      }),
    ).toContain("http://localhost:3060");
  });

  it("includes localhost origins when only the auth URL is non-production", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.gavelhouse.app",
        BETTER_AUTH_URL: "http://localhost:8060",
      }),
    ).toContain("http://localhost:3060");
  });
});

describe("security headers", () => {
  it("adds baseline hardening headers to API responses", async () => {
    const res = await app.request("/health");

    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
});

describe("CORS preflight", () => {
  it("OPTIONS /health preflight returns CORS headers", async () => {
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3060",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3060",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

describe("onError handler", () => {
  it("returns 500 with error message and calls captureException", async () => {
    const res = await app.request("/test-error-route");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Something went wrong. Please try again.",
      trackingId: "event-api-123",
    });
    expect(vi.mocked(captureException)).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: "hono-on-error" },
        extra: { method: "GET", pathname: "/test-error-route" },
      }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      "api_error",
      {
        method: "GET",
        path: "/test-error-route",
        status: 500,
        tracking_id: "event-api-123",
      },
      undefined,
      undefined,
    );
  });

  it("extracts HTTPException responses before internal error reporting", async () => {
    const err = new HTTPException(403, {
      res: Response.json(
        { error: "upgrade_required", minimum: "scale" },
        { status: 403 },
      ),
    });

    const res = getIntentionalErrorResponse(err);

    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "scale",
    });
  });

  it("extracts response objects from intentional errors", async () => {
    const err = new Error("intentional") as Error & { res: Response };
    err.res = Response.json({ error: "teapot" }, { status: 418 });

    const res = getIntentionalErrorResponse(err);

    expect(res?.status).toBe(418);
    await expect(res?.json()).resolves.toEqual({ error: "teapot" });
  });

  it("extracts responses from getResponse helpers", async () => {
    const err = new Error("intentional") as Error & {
      getResponse: () => Response;
    };
    err.getResponse = () => Response.json({ error: "helper" }, { status: 409 });

    const res = getIntentionalErrorResponse(err);

    expect(res?.status).toBe(409);
    await expect(res?.json()).resolves.toEqual({ error: "helper" });
  });

  it("returns intentional responses from the exported app error handler", async () => {
    const err = new Error("intentional") as Error & { res: Response };
    err.res = Response.json({ error: "teapot" }, { status: 418 });
    const context = {
      req: {
        method: "GET",
        url: "https://api.gavelhouse.app/test-intentional-error-route",
      },
      json: vi.fn(),
    };

    const res = await handleAppError(err, context as never);

    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({ error: "teapot" });
    expect(context.json).not.toHaveBeenCalled();
  });

  it("omits tracking_id when error capture does not return an id", async () => {
    vi.mocked(captureException).mockReturnValueOnce(undefined as never);
    const err = new Error("boom");
    const context = {
      req: {
        method: "POST",
        url: "https://api.gavelhouse.app/test-error-route",
      },
      json: vi.fn((body: unknown, status: number) =>
        Response.json(body, { status }),
      ),
    };

    const res = await handleAppError(err, context as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong. Please try again.",
    });
    expect(captureEvent).toHaveBeenCalledWith(
      "api_error",
      {
        method: "POST",
        path: "/test-error-route",
        status: 500,
      },
      undefined,
      undefined,
    );
  });
});

describe("buildSentryOptions", () => {
  it("returns an empty object when initSentry returns null/undefined", () => {
    expect(buildSentryOptions(undefined)).toEqual({});
  });
});

describe("observability middleware", () => {
  it("does not emit noisy request_received analytics", async () => {
    vi.mocked(captureEvent).mockClear();

    const res = await app.request("/lead-magnets/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "starter", sessionId: "session-123" }),
    });

    expect(res.status).toBe(204);
    expect(captureEvent).not.toHaveBeenCalledWith(
      "request_received",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("public marketing routes", () => {
  it("does not expose the retired launch offer endpoint", async () => {
    const res = await app.request("/billing/launch-offer");

    expect(res.status).toBe(404);
  });

  it("keeps lead magnet analytics public despite protected routers", async () => {
    const res = await app.request("/lead-magnets/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "starter", sessionId: "session-123" }),
    });

    expect(res.status).toBe(204);
  });

  it("keeps signed downloads public despite protected routers", async () => {
    const env = {
      LEAD_MAGNET_DOWNLOAD_SECRET: "test-download-secret",
      LEAD_MAGNETS_BUCKET: {
        get: vi.fn(async () => ({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("%PDF-1.7\nbody"));
              controller.close();
            },
          }),
          httpEtag: '"etag-test"',
        })),
      } as unknown as R2Bucket,
    } as Env;
    const signedUrl = await buildSignedLeadMagnetDownloadUrl({
      slug: "reserve-fund-calculator",
      env,
      // Real current time: the 30-day signature must be live when the route
      // verifies it against `new Date()`. A fixed date would expire over time.
      now: new Date(),
    });
    const { pathname, search } = new URL(signedUrl);

    const res = await app.request(`${pathname}${search}`, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("keeps unsubscribe redirects public despite protected routers", async () => {
    const res = await app.request("/unsubscribe?token=not-a-uuid", {}, {
      PUBLIC_WEB_URL: "https://gavelhouse.app",
    } as Env);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
  });
});

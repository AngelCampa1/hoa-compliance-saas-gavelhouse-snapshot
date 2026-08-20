import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @sentry/cloudflare before importing the module under test
vi.mock("@sentry/cloudflare", () => ({
  captureException: vi.fn(() => "event-api-123"),
  withScope: vi.fn((callback: (scope: unknown) => void) =>
    callback({
      setTag: vi.fn(),
      setExtra: vi.fn(),
    }),
  ),
  withSentry: vi.fn((_, handler) => handler),
}));

import * as SentryCloudflare from "@sentry/cloudflare";
import {
  initSentry,
  captureException,
  captureEvent,
  buildInternalErrorBody,
} from "../../src/lib/observability.js";
import type { Env } from "../../src/types/env.js";

type MockScope = {
  setTag: ReturnType<typeof vi.fn>;
  setExtra: ReturnType<typeof vi.fn>;
};

function mockWithScopeOnce(scope: MockScope): void {
  vi.mocked(SentryCloudflare.withScope).mockImplementationOnce((callback) => {
    (callback as unknown as (scope: MockScope) => void)(scope);
    return undefined;
  });
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "https://api.gavelhouse.app",
    APP_URL: "https://my.gavelhouse.app",
    STRIPE_SECRET_KEY: "sk_test_",
    STRIPE_WEBHOOK_SECRET: "whsec_",
    STRIPE_PRICE_STARTER_MONTHLY: "",
    STRIPE_PRICE_STARTER_ANNUAL: "",
    STRIPE_PRICE_GROWTH_MONTHLY: "",
    STRIPE_PRICE_GROWTH_ANNUAL: "",
    STRIPE_PRICE_SCALE_MONTHLY: "",
    STRIPE_PRICE_SCALE_ANNUAL: "",
    STRIPE_PRICE_PORTFOLIO_MONTHLY: "",
    STRIPE_PRICE_PORTFOLIO_ANNUAL: "",
    RESEND_API_KEY: "",
    ...overrides,
  };
}

describe("initSentry", () => {
  it("returns null when env is undefined", () => {
    expect(initSentry(undefined)).toBeNull();
  });

  it("returns null when SENTRY_DSN is absent", () => {
    const result = initSentry(makeEnv());
    expect(result).toBeNull();
  });

  it("returns null when SENTRY_DSN is empty string", () => {
    const result = initSentry(makeEnv({ SENTRY_DSN: "" }));
    expect(result).toBeNull();
  });

  it("returns a CloudflareOptions config when SENTRY_DSN is present", () => {
    const result = initSentry(
      makeEnv({
        SENTRY_DSN: "https://key@sentry.io/123",
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_RELEASE: "boardstack-api@abc123",
      }),
    );
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      dsn: "https://key@sentry.io/123",
      environment: "staging",
      release: "boardstack-api@abc123",
      sendDefaultPii: false,
    });
  });
});

describe("captureException", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.captureException with the error", () => {
    const err = new Error("test error");
    const eventId = captureException(err);
    expect(SentryCloudflare.withScope).toHaveBeenCalledOnce();
    expect(SentryCloudflare.captureException).toHaveBeenCalledWith(err);
    expect(eventId).toBe("event-api-123");
  });

  it("normalizes context through scope tags and extras", () => {
    const err = new Error("ctx error");
    const setTag = vi.fn();
    const setExtra = vi.fn();
    mockWithScopeOnce({ setTag, setExtra });
    const context = {
      tags: { source: "billing", status: 500 },
      extra: { communityId: "abc123" },
    };

    captureException(err, context);

    expect(setTag).toHaveBeenCalledWith("source", "billing");
    expect(setTag).toHaveBeenCalledWith("status", "500");
    expect(setExtra).toHaveBeenCalledWith("communityId", "abc123");
    expect(SentryCloudflare.captureException).toHaveBeenCalledWith(err);
  });

  it("skips undefined tag values", () => {
    const setTag = vi.fn();
    mockWithScopeOnce({ setTag, setExtra: vi.fn() });

    captureException(new Error("tag error"), {
      tags: { present: "yes", skipped: undefined },
    });

    expect(setTag).toHaveBeenCalledWith("present", "yes");
    expect(setTag).not.toHaveBeenCalledWith("skipped", expect.anything());
  });

  it("does not throw for non-Error values", () => {
    expect(() => captureException("string error")).not.toThrow();
    expect(() => captureException(42)).not.toThrow();
    expect(() => captureException(null)).not.toThrow();
  });

  it("builds a safe internal error body with a tracking ID", () => {
    expect(buildInternalErrorBody("event-api-123")).toEqual({
      error: "Something went wrong. Please try again.",
      trackingId: "event-api-123",
    });
  });

  it("omits tracking ID when Sentry did not return one", () => {
    expect(buildInternalErrorBody()).toEqual({
      error: "Something went wrong. Please try again.",
    });
  });
});

describe("captureEvent", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when env is undefined", async () => {
    await captureEvent("test_event", {}, undefined, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no-ops when POSTHOG_KEY is absent", async () => {
    const env = makeEnv();
    await captureEvent("test_event", {}, undefined, env);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no-ops when POSTHOG_KEY is empty string", async () => {
    const env = makeEnv({ POSTHOG_KEY: "" });
    await captureEvent("test_event", {}, undefined, env);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fires a fetch POST to the PostHog ingest endpoint", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("api_error", { method: "GET" }, undefined, env);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.event).toBe("api_error");
    expect(body.api_key).toBe("phc_test123");
    expect((body.properties as Record<string, unknown>).method).toBe("GET");
  });

  it("uses custom POSTHOG_HOST when set", async () => {
    const env = makeEnv({
      POSTHOG_KEY: "phc_test123",
      POSTHOG_HOST: "https://eu.i.posthog.com",
    });
    await captureEvent("api_error", {}, undefined, env);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
  });

  it("normalizes the legacy app host to the US ingest host", async () => {
    const env = makeEnv({
      POSTHOG_KEY: "phc_test123",
      POSTHOG_HOST: "https://app.posthog.com",
    });
    await captureEvent("api_error", {}, undefined, env);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
  });

  it("drops non-canonical analytics events", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });

    await captureEvent("legacy_event", {}, undefined, env);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes userId as distinct_id when provided", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("user_identified", {}, "user-42", env);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.distinct_id).toBe("user-42");
    expect((body.properties as Record<string, unknown>).distinct_id).toBe(
      "user-42",
    );
  });

  it("uses anonymous distinct_id when userId is not provided", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("api_error", {}, undefined, env);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(
      typeof (body.properties as Record<string, unknown>).distinct_id,
    ).toBe("string");
    expect((body.properties as Record<string, unknown>).distinct_id).toMatch(
      /^anon-/,
    );
  });

  it("attaches PostHog community group context when community_id is present", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });

    await captureEvent(
      "activation_step_completed",
      { community_id: "comm-1", step: "roster_imported" },
      "user-42",
      env,
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.properties).toMatchObject({
      community_id: "comm-1",
      distinct_id: "user-42",
      $groups: { community: "comm-1" },
    });
  });

  it("does not throw when fetch rejects", async () => {
    fetchSpy.mockRejectedValue(new Error("network failure"));
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await expect(
      captureEvent("api_error", {}, undefined, env),
    ).resolves.toBeUndefined();
  });

  it("does not throw when fetch returns non-2xx", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await expect(
      captureEvent("api_error", {}, undefined, env),
    ).resolves.toBeUndefined();
  });

  it("includes timestamp in the event payload", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("api_error", {}, undefined, env);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(typeof body.timestamp).toBe("string");
  });

  it("includes a uuid on every captured event for PostHog deduplication", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("api_error", {}, undefined, env);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(typeof body.uuid).toBe("string");
    expect((body.uuid as string).length).toBeGreaterThan(0);
  });

  it("uses a caller-supplied uuid for idempotent business milestones", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });

    await captureEvent(
      "activation_completed",
      { community_id: "comm-1" },
      "user-1",
      env,
      { uuid: "8ca409ad-1cb8-5c98-9ad9-5b0a7d5e7f76" },
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.uuid).toBe("8ca409ad-1cb8-5c98-9ad9-5b0a7d5e7f76");
  });

  it("generates a distinct uuid for each event call", async () => {
    const env = makeEnv({ POSTHOG_KEY: "phc_test123" });
    await captureEvent("api_error", {}, undefined, env);
    await captureEvent("api_error", {}, undefined, env);
    const body1 = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const body2 = JSON.parse(
      (fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body1.uuid).not.toBe(body2.uuid);
  });
});

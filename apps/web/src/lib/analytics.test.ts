import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAnalyticsAttribution,
  buildPostHogBootstrapScript,
  trackEvent,
  identifyUser,
  registerAnalyticsAttribution,
  type PostHogInstance,
} from "./analytics";

function makePostHogMock(
  overrides: Partial<PostHogInstance> = {},
): PostHogInstance {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    register_once: vi.fn(),
    ...overrides,
  };
}

describe("analytics env-var constants", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POSTHOG_API_KEY reads from PUBLIC_POSTHOG_KEY env var", async () => {
    vi.stubEnv("PUBLIC_POSTHOG_KEY", "phc_test_key_123");
    const { POSTHOG_API_KEY } = await import("./analytics");
    expect(POSTHOG_API_KEY).toBe("phc_test_key_123");
  });

  it("POSTHOG_API_KEY falls back to empty string when PUBLIC_POSTHOG_KEY is not set", async () => {
    vi.stubEnv("PUBLIC_POSTHOG_KEY", undefined as unknown as string);
    const { POSTHOG_API_KEY } = await import("./analytics");
    expect(POSTHOG_API_KEY).toBe("");
  });

  it("POSTHOG_HOST reads from PUBLIC_POSTHOG_HOST env var", async () => {
    vi.stubEnv("PUBLIC_POSTHOG_HOST", "https://custom.i.posthog.com");
    const { POSTHOG_HOST } = await import("./analytics");
    expect(POSTHOG_HOST).toBe("https://custom.i.posthog.com");
  });

  it("POSTHOG_HOST normalizes the legacy app host to the CSP-allowed US host", async () => {
    vi.stubEnv("PUBLIC_POSTHOG_HOST", "https://app.posthog.com");
    const { POSTHOG_HOST } = await import("./analytics");
    expect(POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });

  it("POSTHOG_HOST falls back to default URL when PUBLIC_POSTHOG_HOST is not set", async () => {
    vi.stubEnv("PUBLIC_POSTHOG_HOST", undefined as unknown as string);
    const { POSTHOG_HOST } = await import("./analytics");
    expect(POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });
});

describe("buildPostHogBootstrapScript", () => {
  it("enables broad automatic capture with safe masking controls", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "test-key");

    expect(script).toContain("autocapture: true");
    expect(script).toContain("capture_pageview: true");
    expect(script).toContain("capture_pageleave: true");
    expect(script).toContain("capture_performance: { web_vitals: true }");
    expect(script).toContain("session_recording: {");
    expect(script).toContain("maskAllInputs: true");
    expect(script).toContain("email: true");
    expect(script).toContain("data-ph-no-capture");
    expect(script).toContain("before_send: function(event)");
    expect(script).toContain('"$current_url"');
    expect(script).toContain("rageclick: true");
    expect(script).toContain("dead_click: true");
  });

  it("registers the site tag and browser attribution", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "test-key");

    expect(script).toContain('site: "RestrictedBooks"');
    expect(script).toContain("registerAnalyticsAttribution");
    expect(script).toContain("utm_source");
    expect(script).toContain("gclid");
    expect(script).toContain("initial_referrer");
    expect(script).toContain("stripUrlSearchAndHash");
    expect(script).not.toContain("window.location.href,");
  });

  it("uses the provided API key and host values", () => {
    const script = buildPostHogBootstrapScript(
      "RestrictedBooks",
      "test-key",
      "https://example.i.posthog.com",
    );

    expect(script).toContain('posthog.init("test-key", {');
    expect(script).toContain('api_host: "https://example.i.posthog.com"');
  });

  it("omits the PostHog bootstrap when the API key is missing", () => {
    expect(buildPostHogBootstrapScript("RestrictedBooks", "")).toBe("");
  });

  it("omits the PostHog bootstrap when the default API key env is missing", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_POSTHOG_KEY", undefined as unknown as string);
    const { buildPostHogBootstrapScript: buildScript } =
      await import("./analytics");

    expect(buildScript("RestrictedBooks")).toBe("");
  });

  it("does not throw when posthog.init throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "test-key");
    const init = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const register = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
  });

  it("does not throw when posthog.register throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "test-key");
    const register = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const init = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith({ site: "RestrictedBooks" });
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.capture with event name and properties when posthog exists", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("signup_started", { source: "hero" });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("signup_started", { source: "hero" });
  });

  it("calls canonical events with empty properties when omitted", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("signup_started");

    expect(capture).toHaveBeenCalledWith("signup_started", {});
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackEvent("some_event", { key: "value" })).not.toThrow();
  });

  it("calls capture with empty properties when legacy properties arg is omitted", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("page_viewed");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("page_viewed", {});
  });

  it("drops legacy events with unsafe properties", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("page_viewed", { auth_token: "secret" });

    expect(capture).not.toHaveBeenCalled();
  });

  it("does not throw when posthog.capture throws", () => {
    const capture = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ capture });

    expect(() =>
      trackEvent("section_viewed", { section: "hero" }),
    ).not.toThrow();
  });

  it("ignores unknown non-canonical events", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("unknown_legacy_event", { source: "hero" });

    expect(capture).not.toHaveBeenCalled();
  });

  it("ignores retired legacy funnel events", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("signup_submitted", { source_page: "/" });
    trackEvent("lead_magnet_submit", { source_page: "/" });
    trackEvent("pricing_tier_clicked", { source_page: "/pricing" });
    trackEvent("survey_completed", { question_count: 3 });

    expect(capture).not.toHaveBeenCalled();
  });
});

describe("buildAnalyticsAttribution", () => {
  it("strips search params and fragments from landing pages and referrers", () => {
    expect(
      buildAnalyticsAttribution(
        {
          search: "?utm_source=google&survey=open&e=email-token&t=survey-token",
          href: "https://gavelhouse.app/?utm_source=google&survey=open&e=email-token&t=survey-token#lead",
          pathname: "/",
        } as Location,
        "https://example.com/path?email=test@example.com&token=secret#section",
      ),
    ).toMatchObject({
      utm_source: "google",
      landing_page: "https://gavelhouse.app/",
      current_landing_page: "https://gavelhouse.app/",
      initial_referrer: "https://example.com/path",
      current_referrer: "https://example.com/path",
    });
  });

  it("handles empty attribution values and malformed URLs without leaking query params", () => {
    expect(
      buildAnalyticsAttribution(
        {
          search: "?utm_source=&utm_medium=email",
          href: "http://[?token=secret#hash",
          pathname: "/fallback",
        } as Location,
        "http://[?email=test@example.com",
      ),
    ).toMatchObject({
      utm_medium: "email",
      landing_page: "http://[",
      entry_path: "/fallback",
      initial_referrer: "http://[",
      current_referrer: "http://[",
    });
  });

  it("handles missing referrers", () => {
    expect(
      buildAnalyticsAttribution(
        {
          search: "",
          href: "https://gavelhouse.app/pricing?token=secret",
          pathname: "/pricing",
        } as Location,
        "",
      ),
    ).toMatchObject({
      initial_referrer: "",
      landing_page: "https://gavelhouse.app/pricing",
      current_referrer: "",
    });
  });
});

describe("registerAnalyticsAttribution", () => {
  beforeEach(() => {
    delete window.posthog;
    window.localStorage.clear();
    window.history.replaceState(
      null,
      "",
      "/?utm_source=google&gclid=click-123",
    );
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://example.com/path?token=secret",
    });
  });

  afterEach(() => {
    delete window.posthog;
    window.localStorage.clear();
  });

  it("persists first and current touch attribution and registers it in PostHog", () => {
    const register = vi.fn();
    const registerOnce = vi.fn();
    window.posthog = makePostHogMock({
      register,
      register_once: registerOnce,
    });

    registerAnalyticsAttribution();

    expect(registerOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        utm_source: "google",
        gclid: "click-123",
        landing_page: "http://localhost:3000/",
        initial_referrer: "https://example.com/path",
      }),
    );
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        current_landing_page: "http://localhost:3000/",
      }),
    );
    expect(
      window.localStorage.getItem("gavelhouse_first_touch_attribution"),
    ).toContain("google");
  });

  it("keeps the original first touch when attribution already exists", () => {
    window.localStorage.setItem(
      "gavelhouse_first_touch_attribution",
      JSON.stringify({ utm_source: "newsletter" }),
    );
    const registerOnce = vi.fn();
    window.posthog = makePostHogMock({ register_once: registerOnce });

    registerAnalyticsAttribution();

    expect(registerOnce).toHaveBeenCalledWith({ utm_source: "newsletter" });
  });

  it("ignores stored attribution that is not an object", () => {
    window.localStorage.setItem(
      "gavelhouse_first_touch_attribution",
      JSON.stringify(null),
    );
    const registerOnce = vi.fn();
    window.posthog = makePostHogMock({ register_once: registerOnce });

    registerAnalyticsAttribution();

    expect(registerOnce).toHaveBeenCalledWith(
      expect.objectContaining({ utm_source: "google" }),
    );
  });

  it("ignores empty and non-string stored attribution values", () => {
    window.localStorage.setItem(
      "gavelhouse_first_touch_attribution",
      JSON.stringify({ utm_source: "", gclid: 123, utm_medium: "email" }),
    );
    const registerOnce = vi.fn();
    window.posthog = makePostHogMock({ register_once: registerOnce });

    registerAnalyticsAttribution();

    expect(registerOnce).toHaveBeenCalledWith({ utm_medium: "email" });
  });

  it("ignores malformed stored attribution and PostHog registration errors", () => {
    window.localStorage.setItem("gavelhouse_first_touch_attribution", "{");
    window.posthog = makePostHogMock({
      register_once: vi.fn(() => {
        throw new Error("PostHog unavailable");
      }),
    });

    expect(() => registerAnalyticsAttribution()).not.toThrow();
  });
});

describe("identifyUser", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.identify with distinctId and safe properties when posthog exists", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-abc", { role: "treasurer" });

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-abc", {
      role: "treasurer",
    });
  });

  it("drops identify calls with unsafe properties", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-abc", { email: "test@example.com" });

    expect(identify).not.toHaveBeenCalled();
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() =>
      identifyUser("user-abc", { email: "test@example.com" }),
    ).not.toThrow();
  });

  it("calls identify with no properties when properties arg is omitted", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-1");

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-1", undefined);
  });

  it("does not throw when posthog.identify throws", () => {
    const identify = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ identify });

    expect(() =>
      identifyUser("user-1", { email: "test@example.com" }),
    ).not.toThrow();
  });
});

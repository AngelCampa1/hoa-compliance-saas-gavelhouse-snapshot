import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  group: vi.fn(),
  reset: vi.fn(),
};

vi.mock("posthog-js", () => ({
  default: posthogMock,
}));

describe("dashboard analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("initializes PostHog with explicit SPA capture, web vitals, and safe dashboard privacy defaults", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://app.posthog.com");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_app_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        autocapture: {
          dom_event_allowlist: ["click", "submit"],
          element_allowlist: ["a", "button", "form", "input", "select"],
          css_selector_allowlist: ["[data-ph-capture]"],
        },
        capture_pageview: false,
        capture_pageleave: true,
        capture_performance: { web_vitals: true },
        rageclick: true,
        capture_dead_clicks: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "[data-ph-mask], [data-sensitive], [data-private]",
          maskInputOptions: {
            password: true,
            email: true,
            text: true,
            textarea: true,
          },
        },
        mask_all_text: true,
        mask_all_element_attributes: true,
        person_profiles: "identified_only",
      }),
    );
    expect(posthogMock.init.mock.calls[0]![1]).not.toHaveProperty(
      "autocapture_ignore_selectors",
    );
  });

  it("strips query strings and hashes from autocaptured dashboard urls", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    const config = posthogMock.init.mock.calls[0]![1] as {
      before_send(event: { properties?: Record<string, unknown> }): {
        properties?: Record<string, unknown>;
      };
    };
    const event = config.before_send({
      properties: {
        $current_url: "https://app.gavelhouse.app/reports?token=secret#top",
        $referrer: "https://gavelhouse.app/pricing?email=owner@example.com",
        current_url: "https://app.gavelhouse.app/settings?tab=billing",
        referrer: "https://google.com/search?q=hoa",
      },
    });

    expect(event.properties).toEqual({
      $current_url: "https://app.gavelhouse.app/reports",
      $referrer: "https://gavelhouse.app/pricing",
      current_url: "https://app.gavelhouse.app/settings",
      referrer: "https://google.com/search",
    });
  });

  it("leaves missing or non-string autocaptured url properties alone", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    const config = posthogMock.init.mock.calls[0]![1] as {
      before_send(
        event: { properties?: Record<string, unknown> } | undefined,
      ): { properties?: Record<string, unknown> } | undefined;
    };

    expect(config.before_send(undefined)).toBeUndefined();
    expect(config.before_send({})).toEqual({});
    expect(
      config.before_send({
        properties: {
          $current_url: 123,
          current_url: "/reports?token=secret#top",
        },
      }),
    ).toEqual({
      properties: {
        $current_url: 123,
        current_url: "http://localhost:3000/reports",
      },
    });
  });

  it("falls back to string splitting when autocaptured urls cannot be parsed", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    const config = posthogMock.init.mock.calls[0]![1] as {
      before_send(event: { properties?: Record<string, unknown> }): {
        properties?: Record<string, unknown>;
      };
    };

    expect(
      config.before_send({
        properties: {
          $current_url: "http://[::1?token=secret#top",
          referrer: "",
        },
      }).properties,
    ).toEqual({
      $current_url: "http://[::1",
      referrer: "http://localhost:3000/",
    });
  });

  it("uses a custom PostHog host when configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://custom.i.posthog.com");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_app_test",
      expect.objectContaining({
        api_host: "https://custom.i.posthog.com",
      }),
    );
  });

  it("uses the US ingest host when no host is configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_app_test");
    vi.stubEnv("VITE_POSTHOG_HOST", undefined as unknown as string);

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_app_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
      }),
    );
  });

  it("does not initialize when the key is missing", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");

    const { initDashboardAnalytics } = await import("@/lib/analytics");
    initDashboardAnalytics();

    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it("captures canonical events with safe snake_case properties", async () => {
    const { trackDashboardEvent } = await import("@/lib/analytics");

    trackDashboardEvent("report_viewed", {
      report_type: "balance_sheet",
      community_id: "comm-1",
    });

    expect(posthogMock.capture).toHaveBeenCalledWith("report_viewed", {
      report_type: "balance_sheet",
      community_id: "comm-1",
    });
  });

  it("captures canonical events with default empty properties", async () => {
    const { trackDashboardEvent } = await import("@/lib/analytics");

    trackDashboardEvent("activation_completed");

    expect(posthogMock.capture).toHaveBeenCalledWith(
      "activation_completed",
      {},
    );
  });

  it("drops unsafe event properties instead of throwing into the UI", async () => {
    const { trackDashboardEvent } = await import("@/lib/analytics");

    trackDashboardEvent("report_viewed", {
      reportType: "balance_sheet",
    });

    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("swallows PostHog capture failures", async () => {
    posthogMock.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    const { trackDashboardEvent } = await import("@/lib/analytics");

    expect(() => {
      trackDashboardEvent("activation_completed");
    }).not.toThrow();
  });

  it("identifies authenticated users and registers community context", async () => {
    const { identifyDashboardUser } = await import("@/lib/analytics");

    identifyDashboardUser({
      user_id: "user-1",
      community_id: "comm-1",
      role: "owner",
      tier: "growth",
    });

    expect(posthogMock.identify).toHaveBeenCalledWith("user-1");
    expect(posthogMock.register).toHaveBeenCalledWith({
      community_id: "comm-1",
      role: "owner",
      tier: "growth",
    });
    expect(posthogMock.group).toHaveBeenCalledWith("community", "comm-1", {
      role: "owner",
      tier: "growth",
    });
    expect(posthogMock.capture).toHaveBeenCalledWith("user_identified", {
      community_id: "comm-1",
      role: "owner",
      tier: "growth",
    });
  });

  it("identifies users without optional context", async () => {
    const { identifyDashboardUser } = await import("@/lib/analytics");

    identifyDashboardUser({ user_id: "user-1" });

    expect(posthogMock.identify).toHaveBeenCalledWith("user-1");
    expect(posthogMock.register).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("identifies users with non-community context without grouping", async () => {
    const { identifyDashboardUser } = await import("@/lib/analytics");

    identifyDashboardUser({ user_id: "user-1", role: "owner" });

    expect(posthogMock.identify).toHaveBeenCalledWith("user-1");
    expect(posthogMock.register).toHaveBeenCalledWith({ role: "owner" });
    expect(posthogMock.group).not.toHaveBeenCalled();
    expect(posthogMock.capture).toHaveBeenCalledWith("user_identified", {
      role: "owner",
    });
  });

  it("groups users by community without optional role or tier metadata", async () => {
    const { identifyDashboardUser } = await import("@/lib/analytics");

    identifyDashboardUser({ user_id: "user-1", community_id: "comm-1" });

    expect(posthogMock.group).toHaveBeenCalledWith("community", "comm-1", {});
    expect(posthogMock.capture).toHaveBeenCalledWith("user_identified", {
      community_id: "comm-1",
    });
  });

  it("swallows PostHog identify failures", async () => {
    posthogMock.identify.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    const { identifyDashboardUser } = await import("@/lib/analytics");

    expect(() => {
      identifyDashboardUser({
        user_id: "user-1",
        community_id: "comm-1",
      });
    }).not.toThrow();
    expect(posthogMock.register).not.toHaveBeenCalled();
  });

  it("resets dashboard analytics", async () => {
    const { resetDashboardAnalytics } = await import("@/lib/analytics");

    resetDashboardAnalytics();

    expect(posthogMock.reset).toHaveBeenCalled();
  });

  it("swallows PostHog reset failures", async () => {
    posthogMock.reset.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    const { resetDashboardAnalytics } = await import("@/lib/analytics");

    expect(() => {
      resetDashboardAnalytics();
    }).not.toThrow();
  });

  it("captures explicit SPA route changes", async () => {
    const { trackDashboardRoute } = await import("@/lib/analytics");

    trackDashboardRoute("/reports/balance-sheet", "?asOf=2026-05-07");

    expect(posthogMock.capture).toHaveBeenCalledWith("$pageview", {
      path: "/reports/balance-sheet",
      has_search: true,
      app_surface: "dashboard",
    });
  });

  it("captures route changes without search strings", async () => {
    const { trackDashboardRoute } = await import("@/lib/analytics");

    trackDashboardRoute("/settings");

    expect(posthogMock.capture).toHaveBeenCalledWith("$pageview", {
      path: "/settings",
      has_search: false,
      app_surface: "dashboard",
    });
  });

  it("scrubs invitation tokens from route pageviews", async () => {
    const { trackDashboardRoute } = await import("@/lib/analytics");

    trackDashboardRoute("/invitations/invite-secret-token/accept", "?x=y");

    expect(posthogMock.capture).toHaveBeenCalledWith("$pageview", {
      path: "/invitations/[token]/accept",
      has_search: true,
      app_surface: "dashboard",
    });
  });

  it("swallows PostHog route capture failures", async () => {
    posthogMock.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    const { trackDashboardRoute } = await import("@/lib/analytics");

    expect(() => {
      trackDashboardRoute("/settings");
    }).not.toThrow();
  });
});

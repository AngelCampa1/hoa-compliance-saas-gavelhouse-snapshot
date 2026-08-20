import posthog from "posthog-js";
import type { BeforeSendFn } from "posthog-js";
import {
  buildAnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@boardstack/shared";

function normalizePostHogHost(host: string | undefined): string {
  if (!host || host === "https://app.posthog.com") {
    return "https://us.i.posthog.com";
  }
  return host;
}

type DashboardPostHogConfig = NonNullable<Parameters<typeof posthog.init>[1]>;

function stripUrlSearchAndHash(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).split(/[?#]/, 1)[0];
  }
}

function scrubRoutePath(path: string): string {
  return path.replace(
    /^\/invitations\/[^/?#]+\/accept\/?$/,
    "/invitations/[token]/accept",
  );
}

const scrubPostHogUrlProperties: BeforeSendFn = (event) => {
  if (!event) return event;

  if (event.properties) {
    ["$current_url", "$referrer", "current_url", "referrer"].forEach((key) => {
      if (typeof event.properties?.[key] === "string") {
        event.properties[key] = stripUrlSearchAndHash(
          event.properties[key] as string,
        );
      }
    });
  }

  return event;
};

export function initDashboardAnalytics(): void {
  const key = import.meta.env["VITE_POSTHOG_KEY"] as string | undefined;
  if (!key) return;

  const config: DashboardPostHogConfig = {
    api_host: normalizePostHogHost(
      import.meta.env["VITE_POSTHOG_HOST"] as string | undefined,
    ),
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
    before_send: scrubPostHogUrlProperties,
    person_profiles: "identified_only",
  };

  posthog.init(key, config);
}

export function trackDashboardEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  try {
    const event = buildAnalyticsEvent(name, properties);
    posthog.capture(event.name, event.properties);
  } catch {
    // Analytics is best-effort and must not break product workflows.
  }
}

export function identifyDashboardUser({
  user_id,
  community_id,
  role,
  tier,
}: {
  user_id: string;
  community_id?: string;
  role?: string;
  tier?: string;
}): void {
  try {
    posthog.identify(user_id);
    const context = {
      ...(community_id ? { community_id } : {}),
      ...(role ? { role } : {}),
      ...(tier ? { tier } : {}),
    };
    if (Object.keys(context).length > 0) {
      posthog.register(context);
      if (community_id) {
        posthog.group("community", community_id, {
          ...(role ? { role } : {}),
          ...(tier ? { tier } : {}),
        });
      }
      trackDashboardEvent("user_identified", context);
    }
  } catch {
    // Analytics is best-effort and must not break product workflows.
  }
}

export function resetDashboardAnalytics(): void {
  try {
    posthog.reset();
  } catch {
    // Analytics is best-effort and must not break product workflows.
  }
}

export function trackDashboardRoute(path: string, search = ""): void {
  try {
    posthog.capture("$pageview", {
      path: scrubRoutePath(path),
      has_search: search.length > 0,
      app_surface: "dashboard",
    });
  } catch {
    // Analytics is best-effort and must not break product workflows.
  }
}

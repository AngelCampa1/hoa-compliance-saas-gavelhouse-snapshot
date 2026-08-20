import {
  ANALYTICS_ATTRIBUTION_KEYS,
  AnalyticsEventName,
  assertSafeAnalyticsProperties,
  buildAnalyticsEvent,
} from "@boardstack/shared";

// Access import.meta.env directly so vi.stubEnv() can override values in
// tests. Vite replaces import.meta.env.* at build time.
export const POSTHOG_API_KEY = import.meta.env.PUBLIC_POSTHOG_KEY ?? "";

function normalizePostHogHost(host: string | undefined): string {
  if (!host || host === "https://app.posthog.com") {
    return "https://us.i.posthog.com";
  }

  return host;
}

export const POSTHOG_HOST = normalizePostHogHost(
  import.meta.env.PUBLIC_POSTHOG_HOST,
);

export interface PostHogInstance {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  register?(properties: Record<string, unknown>): void;
  register_once?(properties: Record<string, unknown>): void;
}

declare global {
  interface Window {
    posthog?: PostHogInstance;
  }
}

const LEGACY_MARKETING_EVENTS = new Set([
  "billing_toggle_switched",
  "scroll_depth_reached",
  "section_viewed",
  "engaged_time_reached",
  "faq_expanded",
  "email_field_focused",
  "email_field_abandoned",
  "exit_popup_dismissed",
  "exit_popup_shown",
  "exit_popup_converted",
  "lead_magnet_secondary_trial_click",
  "lead_magnet_unlocked",
  "pricebook_builder_inputs_changed",
  "pricebook_pdf_requested",
  "referral_link_copied",
  "cost_calculator_team_size_changed",
  "page_viewed",
]);

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const parsed = AnalyticsEventName.safeParse(event);
    if (parsed.success) {
      const canonicalEvent = buildAnalyticsEvent(parsed.data, properties ?? {});
      window.posthog?.capture(canonicalEvent.name, canonicalEvent.properties);
      return;
    }

    if (LEGACY_MARKETING_EVENTS.has(event)) {
      const safeProperties = properties ?? {};
      assertSafeAnalyticsProperties(safeProperties);
      window.posthog?.capture(event, safeProperties);
    }
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (properties) {
      assertSafeAnalyticsProperties(properties);
    }
    window.posthog?.identify(distinctId, properties);
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

const FIRST_TOUCH_STORAGE_KEY = "gavelhouse_first_touch_attribution";
const CURRENT_TOUCH_STORAGE_KEY = "gavelhouse_current_touch_attribution";

function readStoredRecord(storageKey: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "string" && value.length > 0) {
        record[key] = value;
      }
    }
    return record;
  } catch {
    return {};
  }
}

function writeStoredRecord(
  storageKey: string,
  values: Record<string, string>,
): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // ignore storage failures
  }
}

function referringDomain(referrer: string): string | undefined {
  try {
    return referrer ? new URL(referrer).hostname : undefined;
  } catch {
    return undefined;
  }
}

function stripUrlSearchAndHash(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/, 1).join("");
  }
}

export function buildAnalyticsAttribution(
  locationLike: Pick<
    Location,
    "search" | "href" | "pathname"
  > = window.location,
  referrer = document.referrer,
): Record<string, string> {
  const params = new URLSearchParams(locationLike.search);
  const attribution: Record<string, string> = {};

  for (const key of ANALYTICS_ATTRIBUTION_KEYS) {
    if (
      key.startsWith("initial_") ||
      key.startsWith("current_") ||
      key === "landing_page" ||
      key === "entry_path"
    ) {
      continue;
    }
    const value = params.get(key);
    if (value) attribution[key] = value;
  }

  const domain = referringDomain(referrer);
  const landingPage = stripUrlSearchAndHash(locationLike.href);
  const safeReferrer = referrer ? stripUrlSearchAndHash(referrer) : "";
  return {
    ...attribution,
    initial_referrer: safeReferrer,
    ...(domain ? { initial_referring_domain: domain } : {}),
    landing_page: landingPage,
    entry_path: locationLike.pathname,
    current_referrer: safeReferrer,
    ...(domain ? { current_referring_domain: domain } : {}),
    current_landing_page: landingPage,
    current_entry_path: locationLike.pathname,
  };
}

export function registerAnalyticsAttribution(): void {
  const current = buildAnalyticsAttribution();
  const storedFirstTouch = readStoredRecord(FIRST_TOUCH_STORAGE_KEY);
  const firstTouch =
    Object.keys(storedFirstTouch).length > 0 ? storedFirstTouch : current;

  writeStoredRecord(FIRST_TOUCH_STORAGE_KEY, firstTouch);
  writeStoredRecord(CURRENT_TOUCH_STORAGE_KEY, current);

  try {
    window.posthog?.register_once?.(firstTouch);
    window.posthog?.register?.(current);
  } catch {
    // PostHog is best-effort; attribution failures should never break the page.
  }
}

export function buildPostHogBootstrapScript(
  siteName: string,
  apiKey = POSTHOG_API_KEY,
  apiHost = POSTHOG_HOST,
): string {
  if (!apiKey) {
    return "";
  }

  return `/* PostHog CDN snippet -- loads array.js asynchronously */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub people)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(""),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
try {
  posthog.init(${JSON.stringify(apiKey)}, {
    api_host: ${JSON.stringify(apiHost)},
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_performance: { web_vitals: true },
    rageclick: true,
    dead_click: true,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: true,
        text: true,
        textarea: true
      }
    },
    mask_all_text: false,
    mask_text_selector: "[data-ph-mask], [data-sensitive], [data-private]",
    autocapture_ignore_selectors: [
      "[data-ph-no-capture]",
      "[data-sensitive]",
      "input[type=password]",
      "input[name*=token]",
      "input[name*=card]",
      "textarea[name*=note]",
      "textarea[name*=message]"
    ],
    before_send: function(event) {
      function stripUrlSearchAndHash(url) {
        try {
          var parsed = new URL(url, window.location.origin);
          return parsed.origin + parsed.pathname;
        } catch {
          return String(url || "").split(/[?#]/, 1)[0] || "";
        }
      }
      if (event && event.properties) {
        ["$current_url", "$referrer", "current_url", "referrer"].forEach(function(key) {
          if (typeof event.properties[key] === "string") {
            event.properties[key] = stripUrlSearchAndHash(event.properties[key]);
          }
        });
      }
      return event;
    },
    person_profiles: "identified_only"
  });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}
try {
  posthog.register({ site: ${JSON.stringify(siteName)} });
  (function registerAnalyticsAttribution() {
    var firstTouchKey = ${JSON.stringify(FIRST_TOUCH_STORAGE_KEY)};
    var currentTouchKey = ${JSON.stringify(CURRENT_TOUCH_STORAGE_KEY)};
    var attributionKeys = ${JSON.stringify(ANALYTICS_ATTRIBUTION_KEYS)};
    function readStoredRecord(storageKey) {
      try {
        var raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return Object.keys(parsed).reduce(function (acc, key) {
          if (typeof parsed[key] === "string" && parsed[key].length > 0) {
            acc[key] = parsed[key];
          }
          return acc;
        }, {});
      } catch {
        return {};
      }
    }
    function writeStoredRecord(storageKey, values) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(values));
      } catch {}
    }
    function getReferringDomain(referrer) {
      try {
        return referrer ? new URL(referrer).hostname : undefined;
      } catch {
        return undefined;
      }
    }
    function stripUrlSearchAndHash(url) {
      try {
        var parsed = new URL(url, window.location.origin);
        return parsed.origin + parsed.pathname;
      } catch {
        return String(url || "").split(/[?#]/, 1)[0] || "";
      }
    }
    var params = new URLSearchParams(window.location.search);
    var referrer = document.referrer || "";
    var domain = getReferringDomain(referrer);
    var landingPage = stripUrlSearchAndHash(window.location.href);
    var safeReferrer = referrer ? stripUrlSearchAndHash(referrer) : "";
    var current = {
      initial_referrer: safeReferrer,
      landing_page: landingPage,
      entry_path: window.location.pathname,
      current_referrer: safeReferrer,
      current_landing_page: landingPage,
      current_entry_path: window.location.pathname
    };
    if (domain) {
      current.initial_referring_domain = domain;
      current.current_referring_domain = domain;
    }
    attributionKeys.forEach(function (key) {
      if (
        key.indexOf("initial_") === 0 ||
        key.indexOf("current_") === 0 ||
        key === "landing_page" ||
        key === "entry_path"
      ) {
        return;
      }
      var value = params.get(key);
      if (value) current[key] = value;
    });
    var storedFirstTouch = readStoredRecord(firstTouchKey);
    var firstTouch = Object.keys(storedFirstTouch).length > 0 ? storedFirstTouch : current;
    writeStoredRecord(firstTouchKey, firstTouch);
    writeStoredRecord(currentTouchKey, current);
    window.posthog?.register_once?.(firstTouch);
    window.posthog?.register?.(current);
  })();
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}`;
}

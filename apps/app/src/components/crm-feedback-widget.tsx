import { useEffect } from "react";
import { trackDashboardEvent } from "@/lib/analytics";

const DEFAULT_CRM_LOADER_URL = "https://crm.ventoralabs.com/w/v1.js";
const WIDGET_NAME = "feedback-button";

function loaderHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid_loader_url";
  }
}

/**
 * Mounts the Ventora CRM feedback widget on the authenticated app surface.
 *
 * This replaces the local <FeedbackWidget /> so customer feedback flows to the
 * central Ventora CRM inbox instead of the per-product feedback table. The CRM
 * serves a loader at VITE_CRM_LOADER_URL that finds a
 * `script[data-product][data-widget]` tag, fetches widget data, and injects a
 * Shadow-DOM floating button (position:fixed — so DOM placement is irrelevant).
 *
 * The widget key is CRM-issued per product. When unset (CI/preview without CRM
 * config) we inject nothing so those environments degrade gracefully. The CRM
 * also enforces an authenticated-origin allowlist server-side, so the widget
 * only actually functions on https://my.gavelhouse.app; on any other host
 * (including localhost) the data fetch no-ops, which is expected.
 */
export function CrmFeedbackWidget() {
  const widgetKey = import.meta.env.VITE_CRM_WIDGET_KEY;
  const widgetEnabled = import.meta.env.VITE_CRM_WIDGET_ENABLED === "true";
  const loaderUrl =
    import.meta.env.VITE_CRM_LOADER_URL || DEFAULT_CRM_LOADER_URL;

  useEffect(() => {
    if (!widgetEnabled || !widgetKey) {
      trackDashboardEvent("feedback_widget_unavailable", {
        reason: !widgetEnabled ? "disabled" : "missing_widget_key",
        source: "crm_feedback_widget",
        widget_enabled: widgetEnabled,
      });
      return;
    }

    // Idempotent: never inject the loader twice for the same product key
    // (e.g. across remounts or React StrictMode double-invocation).
    const selector = `script[data-product="${widgetKey}"][data-widget="${WIDGET_NAME}"]`;
    if (document.querySelector(selector)) return;

    const script = document.createElement("script");
    script.src = loaderUrl;
    script.async = true;
    script.setAttribute("data-product", widgetKey);
    script.setAttribute("data-widget", WIDGET_NAME);
    script.addEventListener("error", () => {
      trackDashboardEvent("feedback_widget_load_failed", {
        failure_type: "script_error",
        loader_host: loaderHost(loaderUrl),
        source: "crm_feedback_widget",
        widget_enabled: true,
      });
    });
    script.addEventListener("load", () => {
      trackDashboardEvent("feedback_widget_loaded", {
        loader_host: loaderHost(loaderUrl),
        source: "crm_feedback_widget",
        widget_enabled: true,
      });
    });
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [widgetEnabled, widgetKey, loaderUrl]);

  return null;
}

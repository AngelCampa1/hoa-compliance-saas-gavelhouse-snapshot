import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { CrmFeedbackWidget } from "@/components/crm-feedback-widget";

const trackDashboardEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: trackDashboardEventMock,
}));

const WIDGET_KEY = "wk_test_abc123";
const DEFAULT_LOADER = "https://crm.ventoralabs.com/w/v1.js";

function loaderScripts(productKey: string) {
  return document.querySelectorAll<HTMLScriptElement>(
    `script[data-product="${productKey}"][data-widget="feedback-button"]`,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  trackDashboardEventMock.mockReset();
  // Remove any injected loader scripts so tests stay isolated.
  document
    .querySelectorAll('script[data-widget="feedback-button"]')
    .forEach((el) => el.remove());
});

describe("CrmFeedbackWidget", () => {
  it("injects a loader script with the correct src and data attributes when the key is set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    render(<CrmFeedbackWidget />);

    const scripts = loaderScripts(WIDGET_KEY);
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    expect(script.src).toBe(DEFAULT_LOADER);
    expect(script.getAttribute("data-product")).toBe(WIDGET_KEY);
    expect(script.getAttribute("data-widget")).toBe("feedback-button");
    expect(trackDashboardEventMock).not.toHaveBeenCalledWith(
      "feedback_widget_loaded",
      expect.anything(),
    );
    script.dispatchEvent(new Event("load"));
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "feedback_widget_loaded",
      {
        loader_host: "crm.ventoralabs.com",
        source: "crm_feedback_widget",
        widget_enabled: true,
      },
    );
  });

  it("tracks when the feedback widget is unavailable because config is missing", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "");
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");

    render(<CrmFeedbackWidget />);

    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "feedback_widget_unavailable",
      {
        reason: "missing_widget_key",
        source: "crm_feedback_widget",
        widget_enabled: true,
      },
    );
  });

  it("tracks when the feedback widget loader fails", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    render(<CrmFeedbackWidget />);
    const script = loaderScripts(WIDGET_KEY)[0]!;
    script.dispatchEvent(new Event("error"));

    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "feedback_widget_load_failed",
      {
        failure_type: "script_error",
        loader_host: "crm.ventoralabs.com",
        source: "crm_feedback_widget",
        widget_enabled: true,
      },
    );
  });

  it("uses a custom loader URL when VITE_CRM_LOADER_URL is set", () => {
    const customLoader = "https://crm.example.test/w/v1.js";
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");
    vi.stubEnv("VITE_CRM_LOADER_URL", customLoader);

    render(<CrmFeedbackWidget />);

    const script = loaderScripts(WIDGET_KEY)[0]!;
    expect(script.src).toBe(customLoader);
  });

  it("injects nothing when the widget key is unset", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "");
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");

    render(<CrmFeedbackWidget />);

    expect(
      document.querySelectorAll('script[data-widget="feedback-button"]'),
    ).toHaveLength(0);
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "feedback_widget_unavailable",
      {
        reason: "missing_widget_key",
        source: "crm_feedback_widget",
        widget_enabled: true,
      },
    );
  });

  it("injects nothing when the widget is not explicitly enabled", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "");

    render(<CrmFeedbackWidget />);

    expect(
      document.querySelectorAll('script[data-widget="feedback-button"]'),
    ).toHaveLength(0);
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "feedback_widget_unavailable",
      {
        reason: "disabled",
        source: "crm_feedback_widget",
        widget_enabled: false,
      },
    );
  });

  it("renders no DOM output (the widget injects via document.body only)", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");
    const { container } = render(<CrmFeedbackWidget />);
    expect(container.firstChild).toBeNull();
  });

  it("is idempotent — does not inject a second loader for the same key", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");

    render(<CrmFeedbackWidget />);
    render(<CrmFeedbackWidget />);

    expect(loaderScripts(WIDGET_KEY)).toHaveLength(1);
  });

  it("removes the injected loader script on unmount", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", WIDGET_KEY);
    vi.stubEnv("VITE_CRM_WIDGET_ENABLED", "true");

    const { unmount } = render(<CrmFeedbackWidget />);
    expect(loaderScripts(WIDGET_KEY)).toHaveLength(1);

    unmount();
    expect(loaderScripts(WIDGET_KEY)).toHaveLength(0);
  });
});

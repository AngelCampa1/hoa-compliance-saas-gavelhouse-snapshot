import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackBillingToggle } from "./billing-toggle-tracker";
import type { PostHogInstance } from "./analytics";

function makePostHogMock(
  overrides: Partial<PostHogInstance> = {},
): PostHogInstance {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    ...overrides,
  };
}

describe("trackBillingToggle", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("fires billing_toggle_switched with monthly period and source page", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackBillingToggle("monthly","/pricing");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("billing_toggle_switched", {
      billing_period: "monthly",
      source_page:"/pricing",
    });
  });

  it("fires billing_toggle_switched with annual period and source page", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackBillingToggle("annual","/landing");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("billing_toggle_switched", {
      billing_period: "annual",
      source_page:"/landing",
    });
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackBillingToggle("monthly","/pricing")).not.toThrow();
  });

  it("passes the source_page string exactly as provided", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackBillingToggle("annual","/crewroute/pricing?ref=nav");

    expect(capture).toHaveBeenCalledWith("billing_toggle_switched", {
      billing_period: "annual",
      source_page:"/crewroute/pricing?ref=nav",
    });
  });

  it("fires a separate event per call", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackBillingToggle("monthly","/pricing");
    trackBillingToggle("annual","/pricing");

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, "billing_toggle_switched", {
      billing_period: "monthly",
      source_page:"/pricing",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "billing_toggle_switched", {
      billing_period: "annual",
      source_page:"/pricing",
    });
  });
});

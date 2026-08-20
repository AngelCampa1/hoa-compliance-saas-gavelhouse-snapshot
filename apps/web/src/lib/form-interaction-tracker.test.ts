import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackEmailFocus,
  trackEmailBlurWithoutSubmit,
  resetFocusTracking,
} from "./form-interaction-tracker";
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

describe("trackEmailFocus", () => {
  beforeEach(() => {
    delete window.posthog;
    resetFocusTracking();
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("fires email_field_focused with source_page on first call", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailFocus("/landing");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("email_field_focused", {
      source_page:"/landing",
    });
  });

  it("does NOT fire on second call (dedup -- only once per page load)", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailFocus("/landing");
    trackEmailFocus("/landing");

    expect(capture).toHaveBeenCalledOnce();
  });

  it("does NOT fire on third or subsequent calls", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailFocus("/landing");
    trackEmailFocus("/landing");
    trackEmailFocus("/landing");

    expect(capture).toHaveBeenCalledOnce();
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackEmailFocus("/landing")).not.toThrow();
  });

  it("passes source_page exactly as provided", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailFocus("/crewroute/alternatives/servicetitan?ref=nav");

    expect(capture).toHaveBeenCalledWith("email_field_focused", {
      source_page:"/crewroute/alternatives/servicetitan?ref=nav",
    });
  });
});

describe("resetFocusTracking", () => {
  beforeEach(() => {
    delete window.posthog;
    resetFocusTracking();
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("allows trackEmailFocus to fire again after reset", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailFocus("/landing");
    expect(capture).toHaveBeenCalledOnce();

    resetFocusTracking();

    trackEmailFocus("/landing");
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("allows multiple reset-and-fire cycles", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    for (let i = 0; i < 3; i++) {
      resetFocusTracking();
      trackEmailFocus("/pricing");
      trackEmailFocus("/pricing"); // second call should be no-op
    }

    expect(capture).toHaveBeenCalledTimes(3);
  });
});

describe("trackEmailBlurWithoutSubmit", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("fires email_field_abandoned with had_value: true when hasValue is true", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailBlurWithoutSubmit("/landing", true);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("email_field_abandoned", {
      source_page:"/landing",
      had_value: true,
    });
  });

  it("fires email_field_abandoned with had_value: false when hasValue is false", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailBlurWithoutSubmit("/pricing", false);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("email_field_abandoned", {
      source_page:"/pricing",
      had_value: false,
    });
  });

  it("fires every time -- no dedup", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailBlurWithoutSubmit("/landing", true);
    trackEmailBlurWithoutSubmit("/landing", false);
    trackEmailBlurWithoutSubmit("/landing", true);

    expect(capture).toHaveBeenCalledTimes(3);
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackEmailBlurWithoutSubmit("/landing", true)).not.toThrow();
  });

  it("passes source_page exactly as provided", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEmailBlurWithoutSubmit("/crewroute/guides/dispatch?ref=hero", false);

    expect(capture).toHaveBeenCalledWith("email_field_abandoned", {
      source_page:"/crewroute/guides/dispatch?ref=hero",
      had_value: false,
    });
  });

  it("is independent of focus tracking state", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    // Focus is deduplicated but blur should still fire even after many focuses
    resetFocusTracking();
    trackEmailFocus("/landing");
    trackEmailFocus("/landing"); // no-op

    trackEmailBlurWithoutSubmit("/landing", true);
    trackEmailBlurWithoutSubmit("/landing", true);

    // 1 focus event + 2 blur events
    expect(capture).toHaveBeenCalledTimes(3);
  });
});

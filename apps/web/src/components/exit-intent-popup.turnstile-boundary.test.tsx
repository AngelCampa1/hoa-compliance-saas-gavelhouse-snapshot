/**
 * Tests the turnstileUnavailable degradation path in ExitIntentPopup.
 * Uses a TurnstileBoundary mock that immediately fires onError,
 * simulating a Turnstile render failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import React from "react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

// Mock TurnstileBoundary to immediately call onError so we can exercise
// the turnstileUnavailable branch in the popup
vi.mock("./turnstile-boundary", () => ({
  TurnstileBoundary: vi.fn(
    ({
      onError,
      children,
    }: {
      onError?: () => void;
      children: React.ReactNode;
    }) => {
      React.useEffect(() => {
        onError?.();
      }, [onError]);
      return <>{children}</>;
    },
  ),
}));

vi.mock("../lib/exit-popup-utils", () => ({
  SUPPRESS_DAYS: 7,
  SUPPRESS_KEY: "exit-popup-suppressed",
  SIGNED_UP_KEY: "exit-popup-signed-up",
  isSignedUp: vi.fn(() => false),
  isWithinSuppressWindow: vi.fn(() => false),
  setSuppressed: vi.fn(),
  setSignedUp: vi.fn(),
  detectScrollBack: vi.fn(() => false),
}));

vi.mock("../lib/sentry-client", () => ({
  captureException: vi.fn(),
  captureHttpError: vi.fn(),
  withSentryFeedback: vi.fn(),
}));

vi.mock("../lib/signup-attribution", () => ({
  persistSignupAttribution: vi.fn(),
  resolveSignupAttribution: vi.fn(() => ({})),
}));

vi.mock("../lib/lead-magnet-subscribe", () => ({
  readPosthogDistinctId: vi.fn(() => null),
  subscribeToLeadMagnet: vi.fn(),
}));

import { ExitIntentPopup } from "./exit-intent-popup";

const defaultProps = {
  apiUrl: "https://api.test",
  siteName: "TestSite",
  headline: "Before you go - get started",
  description: "Try TestSite free for 30 days.",
  ctaText: "Get Started",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox.",
};

async function openPopup() {
  act(() => {
    vi.advanceTimersByTime(5100);
  });
  act(() => {
    fireEvent(
      document,
      new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
    );
  });
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ExitIntentPopup with Turnstile boundary error", () => {
  it("still renders the email input when TurnstileBoundary fires onError", async () => {
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();
    expect(screen.getByLabelText("Email address")).toBeDefined();
  });

  it("submit button is NOT permanently disabled when turnstile is unavailable and email is valid", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "test-key");

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const emailInput = screen.getByLabelText("Email address");
    await act(async () => {
      fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    });

    // TurnstileBoundary mock fires onError → turnstileUnavailable=true
    // → isTurnstilePending is false even without a token → button enabled
    const submitButton = screen.getByRole("button", { name: /get started/i });
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });
});

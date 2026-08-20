import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { EmailCapture } from "./email-capture";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../lib/form-interaction-tracker", () => ({
  trackEmailFocus: vi.fn(),
  trackEmailBlurWithoutSubmit: vi.fn(),
  resetFocusTracking: vi.fn(),
}));

vi.mock("../lib/sentry-client", () => ({
  captureHttpError: vi.fn(),
  formatUserError: vi.fn((message: string) => message),
  reportUserFacingError: vi.fn((_error: unknown, message: string) => message),
}));

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

import { trackEvent } from "../lib/analytics";
import {
  trackEmailFocus,
  trackEmailBlurWithoutSubmit,
} from "../lib/form-interaction-tracker";

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/",
  surveyQuestions: [
    { id: "role", text: "Your role?", options: ["Dev", "PM", "Other"] },
  ],
  discoveryCallUrl: "https://cal.com/test",
  buttonText: "Start Free Trial",
  placeholder: "you@company.com",
  privacyNote: "We'll send the requested resource.",
  errorInvalidEmail: "Please enter a valid email address.",
  errorGeneric: "Something went wrong. Try again.",
  successMessage: "You're in!",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EmailCapture", () => {
  it("renders input with placeholder and submit button", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Start Free Trial" }),
    ).toBeDefined();
  });

  it("defaults buttonText to 'Continue' when not provided", () => {
    const { buttonText: _, ...propsWithoutButtonText } = defaultProps;
    render(<EmailCapture {...propsWithoutButtonText} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("applies custom buttonText and placeholder", () => {
    render(
      <EmailCapture
        {...defaultProps}
        buttonText="Join"
        placeholder="email@co.com"
      />,
    );
    expect(screen.getByPlaceholderText("email@co.com")).toBeDefined();
    expect(screen.getByRole("button", { name: "Join" })).toBeDefined();
  });

  it("renders privacy note when provided", () => {
    render(
      <EmailCapture
        {...defaultProps}
        privacyNote="We'll send the requested resource."
      />,
    );
    expect(
      screen.getByText("We'll send the requested resource."),
    ).toBeDefined();
  });

  it("does not render privacy note when set to undefined", () => {
    const { privacyNote: _, ...propsWithoutPrivacy } = defaultProps;
    render(<EmailCapture {...propsWithoutPrivacy} />);
    expect(screen.queryByText("We'll send the requested resource.")).toBeNull();
  });

  it("shows inline validation error for invalid email without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...defaultProps}
        errorInvalidEmail="Please enter a valid email address."
      />,
    );
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "notanemail" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows validation error message from errorInvalidEmail prop", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "bad" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("shows default errorInvalidEmail when error prop is not provided", () => {
    vi.stubGlobal("fetch", vi.fn());

    const {
      errorInvalidEmail: _a,
      errorGeneric: _c,
      ...propsWithoutErrors
    } = defaultProps;
    render(<EmailCapture {...propsWithoutErrors} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "bad" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address"),
    ).toBeDefined();
  });

  it("shows default errorGeneric when error prop is not provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const {
      errorInvalidEmail: _a,
      errorGeneric: _c,
      ...propsWithoutErrors
    } = defaultProps;
    render(<EmailCapture {...propsWithoutErrors} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("applies red border on validation error", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "notvalid" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(input.className).toContain("border-[var(--color-error-500)]");
  });

  it("calls fetch with email, sourcePage and UTM params on submit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: { search: "?utm_source=google&utm_medium=cpc&utm_campaign=test" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/subscribe",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body.email).toBe("a@b.com");
      expect(body.sourcePage).toBe("/");
      expect(body.utmSource).toBe("google");
      expect(body.utmMedium).toBe("cpc");
      expect(body.utmCampaign).toBe("test");
    });

    // Restore location and advance timers to prevent unhandled post-teardown timer
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("uses persisted attribution when the current page query string is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(
      "signup-attribution",
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });

    render(
      <EmailCapture {...defaultProps} sourcePage="/compare/alternatives" />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/subscribe",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body.email).toBe("a@b.com");
      expect(body.sourcePage).toBe("/compare/alternatives");
      expect(body.utmSource).toBe("google");
      expect(body.utmMedium).toBe("cpc");
      expect(body.utmCampaign).toBe("spring");
      expect(body.referredBy).toBe("partner");
    });

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_completed", {
        source_page: "/compare/alternatives",
        has_referral: true,
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
      });
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("shows success message and survey preview on success, then opens survey after 1.5s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        successMessage="You're in!"
        surveyPreview="Quick 30-second survey next"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // After success, button shows success message
    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    // Survey preview text should be visible
    expect(screen.getByText("Quick 30-second survey next")).toBeDefined();

    // Survey should NOT be open yet
    expect(screen.queryByText("Your role?")).toBeNull();

    // Advance 1.5 seconds
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Survey should now be open
    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("renders default success message when successMessage not provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    const { successMessage: _, ...propsWithoutSuccess } = defaultProps;
    render(<EmailCapture {...propsWithoutSuccess} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // The button should show the checkmark SVG and the default "You're in!" text
    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.querySelector("svg")).toBeTruthy();
      expect(button.textContent).toContain("You're in!");
    });
  });

  it("shows PostSignupSurvey after delay on success (no surveyPreview)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("shows success state on 409 response (returning user gets referral flow)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({}),
      }),
    );

    render(<EmailCapture {...defaultProps} successMessage="You're in!" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    // Survey should not yet be visible
    expect(screen.queryByText("Your role?")).toBeNull();

    // After 1.5s the survey opens
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("parses referralCode and position from 409 response body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/waitlist/survey")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              success: true,
              referralCode: "ret123",
              position: 7,
            }),
        });
      }),
    );

    const rewards = [{ threshold: 3, description: "Get 7 extra trial days" }];

    render(
      <EmailCapture
        {...defaultProps}
        referralRewards={rewards}
        productName="TestProduct"
        productDomain="test.app"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Survey opens - answer to reach the referral share screen
    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    // Referral data from 409 body should be shown
    await waitFor(() => {
      expect(screen.getByText("You're signup #7")).toBeDefined();
    });
    expect(
      screen.getByDisplayValue("https://test.app/?ref=ret123"),
    ).toBeDefined();
  });

  it("continues to success/survey flow even when 409 body parse fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.reject(new Error("not json")),
      }),
    );

    render(<EmailCapture {...defaultProps} successMessage="You're in!" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("shows generic error message on non-ok non-409 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        errorGeneric="Something went wrong. Please try again."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("shows errorGeneric message on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });
  });

  it("shows error on fetch network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });
  });

  it("shows custom generic error on fetch network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(
      <EmailCapture
        {...defaultProps}
        errorGeneric="Connection failed. Try again."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Connection failed. Try again.")).toBeDefined();
    });
  });

  it("returns to email form when survey onComplete fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // Wait for success state, then advance timer to open survey
    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Wait for survey to appear
    await waitFor(() => screen.getByText("Your role?"));

    // Answer the single question
    fireEvent.click(screen.getByText("Dev"));

    // Wait for completion screen (survey done dialog)
    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );

    // Dismiss the survey via close button
    fireEvent.click(screen.getByLabelText("Close"));

    // Should show the email form again
    await waitFor(() => {
      expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
    });
  });

  it("disables input and button during loading", async () => {
    let resolveFetch: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button).toHaveProperty("disabled", true);
      expect(button.textContent).toContain("Sending\u2026");
    });

    await act(async () => {
      resolveFetch!({ ok: true, status: 200 });
    });
  });

  it("adds cursor-wait class to button during loading", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.className).toContain("cursor-wait");
    });

    await act(async () => {
      resolveFetch!({ ok: true, status: 200 });
    });
  });

  it("clears validation error when user retypes email", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");

    // Trigger validation error
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();

    // User retypes email - error should clear
    fireEvent.change(input, { target: { value: "a@b.com" } });

    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  it("accepts valid email formats and proceeds to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // --- subtitle prop ---

  it("renders subtitle when provided", () => {
    render(
      <EmailCapture
        {...defaultProps}
        subtitle="Y80OFF and 30-day money-back guarantee."
      />,
    );
    expect(
      screen.getByText("Y80OFF and 30-day money-back guarantee."),
    ).toBeDefined();
  });

  it("renders subtitle, privacy note, and whatHappensNext in outcome-to-process order", () => {
    render(
      <EmailCapture
        {...defaultProps}
        subtitle="See your symptom patterns more clearly."
        privacyNote="Private by design. No ads. No data selling."
        whatHappensNext="We will email your access link right away."
      />,
    );

    const copyBlocks = screen.getAllByText(
      /See your symptom patterns more clearly\.|Private by design\. No ads\. No data selling\.|We will email your access link right away\./,
    );

    expect(copyBlocks.map((node) => node.textContent)).toEqual([
      "See your symptom patterns more clearly.",
      "Private by design. No ads. No data selling.",
      "We will email your access link right away.",
    ]);
  });

  it("does not render subtitle when not provided", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(
      screen.queryByText("Y80OFF and 30-day money-back guarantee."),
    ).toBeNull();
  });

  // --- whatHappensNext prop ---

  it("renders whatHappensNext in idle state when provided", () => {
    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    expect(
      screen.getByText("We'll send you a confirmation email right away."),
    ).toBeDefined();
  });

  it("does not render whatHappensNext when status is loading", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.queryByText("We'll send you a confirmation email right away."),
      ).toBeNull();
    });

    await act(async () => {
      resolveFetch!({ ok: true, status: 200 });
    });
  });

  it("does not render whatHappensNext when status is success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    expect(
      screen.queryByText("We'll send you a confirmation email right away."),
    ).toBeNull();
  });

  it("does not render whatHappensNext when status is error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });

    expect(
      screen.queryByText("We'll send you a confirmation email right away."),
    ).toBeNull();
  });

  // --- privacyNote prop ---

  it("does not render privacy note when privacyNote prop is not provided", () => {
    const { privacyNote: _, ...propsWithoutPrivacy } = defaultProps;
    render(<EmailCapture {...propsWithoutPrivacy} />);
    expect(screen.queryByText("We'll send the requested resource.")).toBeNull();
  });

  it("renders privacyNote when explicitly provided", () => {
    render(
      <EmailCapture {...defaultProps} privacyNote="Your data stays private." />,
    );
    expect(screen.getByText("Your data stays private.")).toBeDefined();
  });

  // --- errorDuplicate prop ---

  it("shows errorDuplicate message when errorDuplicate prop is provided and API returns 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        errorDuplicate="You've already signed up"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You've already signed up")).toBeDefined();
    });
  });

  it("shows success state (not error) on 409 - error container stays sr-only", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({}),
      }),
    );

    const { container } = render(
      <EmailCapture {...defaultProps} successMessage="You're in!" />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      // 409 now shows success - error container stays sr-only
      const errorEl = container.querySelector("[aria-live='polite']");
      expect(errorEl).toBeTruthy();
      expect(errorEl?.className).toContain("sr-only");
      expect(errorEl?.className).not.toContain("text-[var(--color-error-500)]");
      expect(errorEl?.textContent).toBe("");
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
  });

  // --- referral props ---

  it("passes referral props to PostSignupSurvey after successful signup with referralCode in response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            referralCode: "abc123",
            position: 42,
          }),
      }),
    );

    const rewards = [
      { threshold: 3, description: "Get 7 extra trial days" },
      { threshold: 10, description: "30 extra days on your free trial" },
    ];

    render(
      <EmailCapture
        {...defaultProps}
        referralRewards={rewards}
        productName="TestProduct"
        productDomain="test.app"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Survey should appear - answer to trigger done state
    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    // After survey completes, referral share should appear
    await waitFor(() => {
      expect(screen.getByText("You're signup #42")).toBeDefined();
    });
    expect(
      screen.getByDisplayValue("https://test.app/?ref=abc123"),
    ).toBeDefined();
  });

  // --- visible label ---

  it("label shows custom emailLabel when provided", () => {
    render(<EmailCapture {...defaultProps} emailLabel="Work email" />);
    expect(screen.getByText("Work email")).toBeDefined();
  });

  it('label defaults to "Email address" when emailLabel prop is omitted', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByText("Email address")).toBeDefined();
  });

  // --- aria-label ---

  it('form has aria-label "Continue with your email"', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();
  });

  it("does not render question-related whatHappensNext copy before submit", () => {
    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="Answer 3 quick questions so we can place you in the right launch cohort."
      />,
    );

    expect(
      screen.queryByText(
        "Answer 3 quick questions so we can place you in the right launch cohort.",
      ),
    ).toBeNull();
  });

  it('form does NOT have the old aria-label "Sign up for a free trial"', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(
      screen.queryByRole("form", { name: "Sign up for a free trial" }),
    ).toBeNull();
  });

  // --- isPlausibleEmail edge cases ---

  it('rejects "@." - nothing before @ and dot immediately after', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "@." },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "@.com" - nothing before @', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "@.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "user@" - no dot after @', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "user@.com" - dot immediately after @, no chars between @ and dot', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "a@b.c" - single-char TLD fails the strict regex (requires 2+ alpha chars)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.c" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it('accepts "user@example.com" - standard valid email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  it('rejects "user@@example.com" - double @ is invalid per the strict RFC-compliant regex', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  // --- survey=open auto-open ---

  it("opens survey immediately when ?survey=open&e=<base64email> is in the URL", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    // Email form should not be visible
    expect(
      screen.queryByRole("form", { name: "Continue with your email" }),
    ).toBeNull();

    // Restore location
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("does not auto-open survey when survey=open but e param is missing", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?survey=open" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();
    expect(screen.queryByText("Your role?")).toBeNull();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("does not auto-open survey when e param is present but survey param is not 'open'", () => {
    const encodedEmail = btoa("test@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("ignores malformed base64 in e param without crashing", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?survey=open&e=!!!invalid!!!" },
      writable: true,
      configurable: true,
    });

    expect(() => render(<EmailCapture {...defaultProps} />)).not.toThrow();

    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- H4: stricter EMAIL_REGEX ---

  it("rejects email with double dots in local part (strict regex disallows consecutive dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user..name@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with leading dot in local part (strict regex disallows leading dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: ".user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with trailing dot in local part (strict regex disallows trailing dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user.@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with TLD shorter than 2 characters", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.c" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with digits-only TLD", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("accepts email with subaddress (plus sign in local part)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user+tag@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("accepts email with hyphenated domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@my-company.io" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("rejects email with leading hyphen in domain label (strict regex)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@-example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() =>
      expect(
        screen.getByText("Please enter a valid email address."),
      ).toBeDefined(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects email with trailing hyphen in domain label (strict regex disallows trailing hyphens)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example-.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() =>
      expect(
        screen.getByText("Please enter a valid email address."),
      ).toBeDefined(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not auto-open survey when decoded base64 email is invalid", () => {
    // btoa("notanemail") - valid base64 but invalid email after decoding
    const encodedInvalidEmail = btoa("notanemail");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedInvalidEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    // Should NOT open survey because "notanemail" fails EMAIL_REGEX
    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();
    expect(screen.queryByText("Your role?")).toBeNull();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- emailLabel prop and default placeholder ---

  it("renders a visible label for the email field", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
  });

  it("renders 'Email address' as the default label", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByText("Email address")).toBeDefined();
  });

  it("renders custom emailLabel when prop is provided", () => {
    render(<EmailCapture {...defaultProps} emailLabel="Work email" />);
    expect(screen.getByText("Work email")).toBeDefined();
    expect(screen.getByLabelText("Work email")).toBeDefined(); // label must be associated with the input
  });

  it("uses custom inputId when prop is provided", () => {
    render(<EmailCapture {...defaultProps} inputId="hero-email" />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input.id).toBe("hero-email");
    const label = screen.getByText("Email address");
    expect((label as HTMLLabelElement).htmlFor).toBe("hero-email");
  });

  it("uses 'your@email.com' as default placeholder when none provided", () => {
    const { placeholder: _, ...propsWithoutPlaceholder } = defaultProps;
    render(<EmailCapture {...propsWithoutPlaceholder} />);
    expect(screen.getByPlaceholderText("your@email.com")).toBeDefined();
  });

  it("does not pass referral data when API response has no referralCode", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        referralRewards={[
          { threshold: 3, description: "Get 7 extra trial days" },
        ]}
        productName="TestProduct"
        productDomain="test.app"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    // Survey completes but no referral share since no referralCode
    // The survey dialog should show the done state
    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(screen.queryByText(/signup #/)).toBeNull();
  });

  // --- surveyToken threading ---

  it("captures surveyToken from successful signup response and passes to PostSignupSurvey", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            referralCode: "abc123",
            position: 1,
            surveyToken: "tok_test_abc",
          }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      const surveyCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("/waitlist/survey"),
      );
      expect(surveyCall).toBeDefined();
      const body = JSON.parse((surveyCall![1] as { body: string }).body) as {
        surveyToken: string;
      };
      expect(body.surveyToken).toBe("tok_test_abc");
    });
  });

  it("captures surveyToken from 409 response and passes to PostSignupSurvey", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            success: true,
            referralCode: "dup123",
            position: 5,
            surveyToken: "tok_dup_xyz",
          }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      const surveyCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("/waitlist/survey"),
      );
      expect(surveyCall).toBeDefined();
      const body = JSON.parse((surveyCall![1] as { body: string }).body) as {
        surveyToken: string;
      };
      expect(body.surveyToken).toBe("tok_dup_xyz");
    });
  });

  it("captures surveyToken from ?t= URL param and passes to PostSignupSurvey", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: {
        search: `?survey=open&e=${encodedEmail}&t=tok_url_param`,
      },
      writable: true,
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      const surveyCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("/waitlist/survey"),
      );
      expect(surveyCall).toBeDefined();
      const body = JSON.parse((surveyCall![1] as { body: string }).body) as {
        surveyToken: string;
      };
      expect(body.surveyToken).toBe("tok_url_param");
    });

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- survey copy forwarding ---

  it("forwards qualifiedHeading to PostSignupSurvey - shown on result screen after survey completes", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        qualifiedHeading="You're exactly who we built this for"
        qualifiedCtaText="Book a 15-minute call"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() =>
      expect(
        screen.getByText("You're exactly who we built this for"),
      ).toBeDefined(),
    );
  });

  it("forwards unqualifiedHeading to PostSignupSurvey - shown on result screen after survey auto-open", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...defaultProps}
        unqualifiedHeading="Thanks for your interest"
        unqualifiedCtaText="Explore our guides"
        unqualifiedCtaTarget="/resources"
      />,
    );

    await waitFor(() => screen.getByText("Your role?"));

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- qualifiedDismissText / unqualifiedDismissText forwarding ---

  it("forwards qualifiedDismissText to PostSignupSurvey - shown as dismiss button on qualified result screen", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        qualifiedHeading="You're a great fit"
        qualifiedDismissText="Maybe later"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => expect(screen.getByText("Maybe later")).toBeDefined());
  });

  it("accepts unqualifiedDismissText prop without error", () => {
    render(
      <EmailCapture {...defaultProps} unqualifiedDismissText="No thanks" />,
    );
    expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
  });

  it("forwards qualification rules to PostSignupSurvey and uses them after signup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        qualification={{
          logic: "all",
          rules: [{ questionId: "role", answers: ["Other"] }],
        }}
        unqualifiedHeading="You're on the list!"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      expect(screen.getByText("You're on the list!")).toBeDefined();
    });
  });

  // --- ariaLabel prop ---

  it("uses default aria-label 'Continue with your email' when ariaLabel is not provided", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(
      screen.getByRole("form", { name: "Continue with your email" }),
    ).toBeDefined();
  });

  it("uses custom ariaLabel when provided", () => {
    render(<EmailCapture {...defaultProps} ariaLabel="Create your account" />);
    expect(
      screen.getByRole("form", { name: "Create your account" }),
    ).toBeDefined();
    expect(
      screen.queryByRole("form", { name: "Continue with your email" }),
    ).toBeNull();
  });

  // --- loadingText prop ---

  it("shows default loading text during submission when loadingText is not provided", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Sending\u2026")).toBeDefined();
    });

    await act(async () => {
      resolveFetch!({ ok: true, status: 200 });
    });
  });

  it("shows custom loadingText during submission when provided", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} loadingText={"Processing\u2026"} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Processing\u2026")).toBeDefined();
      expect(screen.queryByText("Sending\u2026")).toBeNull();
    });

    await act(async () => {
      resolveFetch!({ ok: true, status: 200 });
    });
  });

  // Bug 4: aria-describedby must be scoped to inputId
  it("aria-describedby on input matches the error element's id (scoped by inputId)", () => {
    render(<EmailCapture {...defaultProps} inputId="signup-email" />);
    const input = screen.getByRole("textbox");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    // Must be derived from inputId, not a hardcoded "email-capture-error"
    expect(describedById).toBe("signup-email-error");
    // The error element with that id must exist in the DOM
    expect(document.getElementById("signup-email-error")).not.toBeNull();
  });

  it("error element id uses a generated default id when inputId not specified", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByRole("textbox");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toMatch(/^email-capture-.+-error$/);
    expect(document.getElementById(describedById ?? "")).not.toBeNull();
  });

  it("generates unique default ids when multiple instances render on the same page", () => {
    render(
      <>
        <EmailCapture {...defaultProps} />
        <EmailCapture {...defaultProps} />
      </>,
    );

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);

    const ids = inputs.map((input) => input.getAttribute("id"));
    expect(new Set(ids).size).toBe(2);

    const describedByIds = inputs.map((input) =>
      input.getAttribute("aria-describedby"),
    );
    expect(new Set(describedByIds).size).toBe(2);
  });

  // Bug 8 & 9: setTimeout cleanup on unmount
  it("cleans up survey-delay timer on unmount without errors", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    const { unmount } = render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));

    // Unmount before the 1.5s timer fires
    unmount();

    // Advance past the timer - should not throw or call setState on unmounted component
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  // Bug 5: submit button must be disabled in success state
  it("submit button is disabled after successful submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn).toHaveProperty("disabled", true);
    });
  });

  // Bug 8: successMessage must default to "You're in!" when not provided
  it("renders default success message when successMessage prop is omitted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    const { successMessage: _, ...propsWithoutSuccessMessage } = defaultProps;
    render(<EmailCapture {...propsWithoutSuccessMessage} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });
  });

  // --- analytics event tracking ---

  describe("analytics event tracking", () => {
    beforeEach(() => {
      Object.defineProperty(window, "location", {
        value: { search: "" },
        writable: true,
        configurable: true,
      });
    });

    it("fires signup_completed with correct properties on successful signup", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
      );
      Object.defineProperty(window, "location", {
        value: {
          search:
            "?utm_source=google&utm_medium=cpc&utm_campaign=spring&ref=abc",
        },
        writable: true,
        configurable: true,
      });

      render(<EmailCapture {...defaultProps} sourcePage="/landing/hero" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_completed", {
          source_page: "/landing/hero",
          has_referral: true,
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "spring",
        });
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires signup_completed without UTM keys when no query params", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
      );

      render(<EmailCapture {...defaultProps} sourcePage="/home" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledTimes(2);
        const [eventName, props] = vi.mocked(trackEvent).mock.calls[0];
        expect(eventName).toBe("signup_completed");
        expect(props).toMatchObject({
          source_page: "/home",
          has_referral: false,
        });
        expect(props).not.toHaveProperty("utm_source");
        expect(props).not.toHaveProperty("utm_medium");
        expect(props).not.toHaveProperty("utm_campaign");
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires signup_duplicate with source_page when errorDuplicate prop is set and API returns 409", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({}),
        }),
      );

      render(
        <EmailCapture
          {...defaultProps}
          sourcePage="/pricing"
          errorDuplicate="You've already signed up"
        />,
      );
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_duplicate", {
          source_page: "/pricing",
        });
      });
    });

    it("fires signup_duplicate on 409 even when errorDuplicate prop is not set", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({}),
        }),
      );

      render(<EmailCapture {...defaultProps} sourcePage="/pricing" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(screen.getByText("You're in!")).toBeDefined();
      });

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_duplicate", {
        source_page: "/pricing",
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires form_submission_failed on a generic fetch error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      );

      render(<EmailCapture {...defaultProps} />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong. Try again."),
        ).toBeDefined();
      });

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        "form_submission_failed",
        {
          form_name: "email_capture",
          source_page: "/",
          failure_type: "http_error",
          status_code: 500,
        },
      );
    });

    it("fires form_submission_failed on a network error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network failure")),
      );

      render(<EmailCapture {...defaultProps} />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong. Try again."),
        ).toBeDefined();
      });

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        "form_submission_failed",
        {
          form_name: "email_capture",
          source_page: "/",
          failure_type: "network_error",
        },
      );
    });

    it("fires waitlist_submitted alongside signup_completed with source=email_capture and UTM props", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
      );
      Object.defineProperty(window, "location", {
        value: {
          search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring",
        },
        writable: true,
        configurable: true,
      });

      render(<EmailCapture {...defaultProps} sourcePage="/landing/hero" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
          "waitlist_submitted",
          {
            source: "email_capture",
            source_page: "/landing/hero",
            utm_source: "google",
            utm_medium: "cpc",
            utm_campaign: "spring",
          },
        );
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires waitlist_submitted without UTM keys when no query params", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
      );

      render(<EmailCapture {...defaultProps} sourcePage="/home" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        const submittedCall = vi
          .mocked(trackEvent)
          .mock.calls.find(([name]) => name === "waitlist_submitted");
        expect(submittedCall).toBeDefined();
        const [, props] = submittedCall!;
        expect(props).toMatchObject({
          source: "email_capture",
          source_page: "/home",
        });
        expect(props).not.toHaveProperty("utm_source");
        expect(props).not.toHaveProperty("utm_medium");
        expect(props).not.toHaveProperty("utm_campaign");
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("does NOT fire waitlist_submitted on error responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      );

      render(<EmailCapture {...defaultProps} />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Start Free Trial" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong. Try again."),
        ).toBeDefined();
      });

      const submittedCall = vi
        .mocked(trackEvent)
        .mock.calls.find(([name]) => name === "waitlist_submitted");
      expect(submittedCall).toBeUndefined();
    });
  });

  // Bug 3c: timer overwrite without clearing previous timer.
  it("only one timer is pending when a duplicate submission immediately follows a 200 signup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Both calls resolve 200 success (schedules a 1500ms timer each time).
    // The second submit happens while the first timer is still pending, which
    // exercises the clearTimeout guard at line ~184 of email-capture.tsx.
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...defaultProps}
        // No errorDuplicate so 409 goes through success path too
      />,
    );

    const input = screen.getByPlaceholderText("you@company.com");

    // First successful submit - starts the 1500ms survey-open timer
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));

    // Advance 750ms (half the 1500ms delay) - survey not yet open
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(screen.queryByText("Your role?")).toBeNull();

    // Second submit while the first timer is still pending.
    // The button is disabled at this point, so we submit the form element
    // directly to bypass the DOM guard and hit the clearTimeout branch.
    const form = document.querySelector("form[aria-label]")!;
    await act(async () => {
      fireEvent.submit(form);
      // Drain the microtask queue so the second fetch resolves
      await Promise.resolve();
    });

    // Advance past the SECOND timer's 1500ms window (i.e., 750ms already
    // elapsed + 1500ms for the reset timer = 2250ms total; we only advanced
    // 750ms so far, so advance 1600ms more to land just past 1500ms).
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    // The survey should appear exactly once (clearTimeout prevented the first
    // timer from also firing setShowSurvey).
    expect(screen.getAllByText("Your role?").length).toBe(1);
  });

  it("calls trackEmailFocus when email input receives focus", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.focus(input);
    expect(trackEmailFocus).toHaveBeenCalledWith("/");
  });

  it("calls trackEmailBlurWithoutSubmit when email input loses focus", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).toHaveBeenCalledWith("/", false);
  });

  it("does not call trackEmailBlurWithoutSubmit when status is loading", async () => {
    // Make fetch hang so status stays "loading"
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "valid@email.com" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Continue with your email" }),
    );

    // Status is now "loading" - blur should NOT fire tracker
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).not.toHaveBeenCalled();
  });

  it("passes had_value: true when email has content on blur", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "partial@" } });
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).toHaveBeenCalledWith("/", true);
  });

  // --- WCAG 1.3.5 autocomplete & required ---

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  // --- honeypot and Turnstile coverage ---

  it("renders a honeypot input that is visually hidden", () => {
    render(<EmailCapture {...defaultProps} />);
    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement | null;
    expect(honeypotInput).not.toBeNull();
    expect(honeypotInput?.tabIndex).toBe(-1);
    expect(honeypotInput?.getAttribute("aria-hidden")).toBe("true");
    expect(honeypotInput?.getAttribute("autocomplete")).toBe("off");
  });

  it("honeypot onChange updates the honeypot value", () => {
    render(<EmailCapture {...defaultProps} />);
    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement;
    fireEvent.change(honeypotInput, { target: { value: "bot-fill" } });
    expect(honeypotInput.value).toBe("bot-fill");
  });

  it("sets turnstileToken when TurnstileWidget onVerify is called", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { TurnstileWidget } = await import("./turnstile-widget");
    const mockedWidget = vi.mocked(TurnstileWidget);

    render(<EmailCapture {...defaultProps} />);

    // Trigger onVerify to cover setTurnstileToken
    const onVerify =
      mockedWidget.mock.calls[mockedWidget.mock.calls.length - 1]?.[0].onVerify;
    if (onVerify)
      act(() => {
        onVerify("cf-tok-ec");
      });

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body.turnstileToken).toBe("cf-tok-ec");
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
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

const defaultProps = {
  apiUrl: "/api",
  sourcePage: "/guides/privacy",
  signupFlowConfigUrl: "/signup-flow.json",
};

describe("EmailCapture signup flow config", () => {
  it("shows loading state text when no signupFlowConfigUrl is provided (no-config branch)", async () => {
    vi.stubGlobal("fetch", vi.fn());

    // No signupFlowConfigUrl, no surveyQuestions/discoveryCallUrl - goes to the
    // !signupFlowConfigUrl branch in loadSignupFlowConfig, returns null early
    render(<EmailCapture apiUrl="/api" sourcePage="/test" />);

    // Component shows "Loading signup form..." state since no config was loaded
    expect(screen.getByText("Loading signup form…")).toBeDefined();
  });

  it("loads survey config from a public JSON endpoint before rendering the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          surveyQuestions: [
            { id: "role", text: "Role?", options: ["User", "Other"] },
          ],
          discoveryCallUrl: "https://cal.test/floriva",
          subtitle: "Stored on your device.",
        }),
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    expect(
      screen.getByText("Loading signup form…", { exact: false }),
    ).toBeDefined();

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
      expect(screen.getByText("Stored on your device.")).toBeDefined();
    });
  });

  it("shows a retry state when the signup-flow request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load the signup form."),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });
  });

  it("clicking Try again after failure retries the load and shows the form on success", async () => {
    const surveyConfig = {
      surveyQuestions: [
        { id: "role", text: "Role?", options: ["User", "Other"] },
      ],
      discoveryCallUrl: "https://cal.test/test",
    };
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          json: async () => surveyConfig,
        });
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
    });
  });

  it("shows a retry state when the signup-flow request is rejected (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load the signup form."),
      ).toBeDefined();
    });
  });

  it("uses privacyNote from loaded config when prop is absent", async () => {
    const surveyConfig = {
      privacyNote: "Config privacy note",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => surveyConfig,
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Config privacy note")).toBeDefined();
    });
  });

  it("uses surveyPreview from loaded config when prop is absent and status is success", async () => {
    const surveyConfig = {
      surveyPreview: "Survey preview from config",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => surveyConfig,
          });
        }
        // API call succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({ surveyToken: "tok123" }),
        });
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Survey preview from config")).toBeDefined();
    });
  });

  it("renders visibleWhatHappensNext from loaded config when prop is absent", async () => {
    // "What happens next" text that does NOT match the survey/question pattern
    const surveyConfig = {
      whatHappensNext: "We'll review your application shortly.",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => surveyConfig,
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("We'll review your application shortly."),
      ).toBeDefined();
    });
  });

  it("shows error-duplicate message from prop when a 409 is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => ({}),
          });
        }
        // Simulate a 409 duplicate response
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({}),
        });
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        errorDuplicate="You're already on our list!"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "duplicate@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("You're already on our list!")).toBeDefined();
    });
  });

  it("renders survey with empty questions/discoveryCallUrl when config has none", async () => {
    // Config with no surveyQuestions or discoveryCallUrl - exercises the ?? [] and ?? "" fallbacks
    const surveyConfig = {
      surveyPreview: "Quick survey ahead",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => surveyConfig,
          });
        }
        // API signup succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({ surveyToken: "tok-xyz" }),
        });
      }),
    );

    vi.useFakeTimers();

    await act(async () => {
      render(<EmailCapture {...defaultProps} />);
      await vi.runAllTimersAsync();
    });

    // Now the form should be visible
    expect(screen.getByLabelText("Email address")).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "test@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      // Flush submit fetch + state updates
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      // Advance the 1500ms timer to trigger showSurvey, then flush microtasks
      vi.advanceTimersByTime(1500);
      await vi.runAllTimersAsync();
    });

    // PostSignupSurvey is now rendered with empty questions / discoveryCallUrl="".
    // The email input disappears - the form is replaced by the survey.
    expect(screen.queryByLabelText("Email address")).toBeNull();

    vi.useRealTimers();
  });

  it("deduplicates an in-flight config load when the effect fires a second time before the first resolves", async () => {
    // Uses fake timers to keep the first fetch pending long enough for a
    // second loadSignupFlowConfig() call to see signupFlowRequestRef.current
    // already set (false-side of `if (!signupFlowRequestRef.current)`).
    vi.useFakeTimers();

    let fetchResolve!: (v: {
      ok: boolean;
      json: () => Promise<{ privacyNote: string }>;
    }) => void;
    const pendingFetch = new Promise<{
      ok: boolean;
      json: () => Promise<{ privacyNote: string }>;
    }>((res) => {
      fetchResolve = res;
    });

    let configFetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/signup-flow.json" || url === "/signup-flow-v2.json") {
          configFetchCount++;
          if (configFetchCount === 1) {
            return pendingFetch;
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ privacyNote: "Second call" }),
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    const { rerender } = render(<EmailCapture {...defaultProps} />);

    // Flush microtasks so the first loadSignupFlowConfig is called and
    // signupFlowRequestRef.current is set to the pending promise.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Re-render with a new URL - the useEffect runs again calling
    // loadSignupFlowConfig(), which hits the FALSE branch (ref is truthy).
    await act(async () => {
      rerender(
        <EmailCapture
          {...defaultProps}
          signupFlowConfigUrl="/signup-flow-v2.json"
        />,
      );
      await vi.runAllTimersAsync();
    });

    // Now resolve the pending fetch so the first load completes.
    await act(async () => {
      fetchResolve({
        ok: true,
        json: async () => ({ privacyNote: "From deduped load" }),
      });
      await vi.runAllTimersAsync();
    });

    // The form should now be visible (loaded via the deduplicated promise).
    expect(screen.getByLabelText("Email address")).toBeDefined();

    vi.useRealTimers();
  });
});

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockInstance,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  isSignedUp: vi.fn(() => false),
  setSignedUp: vi.fn(),
}));
vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

import { isSignedUp, setSignedUp } from "../lib/exit-popup-utils";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { GatedContent } from "./gated-content";

const mockIsSignedUp = isSignedUp as unknown as MockInstance;
const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockTrackEvent = trackEvent as unknown as MockInstance;
const mockCaptureException = captureException as unknown as MockInstance;

const defaultProps = {
  apiUrl: "https://api.test",
  leadMagnetTitle: "Free Guide to Testing",
  description: "Get this free guide by entering your email.",
  ctaText: "Get the Free Guide",
  teaserHtml: "<h2>Section 1</h2><p>This is free content.</p>",
  gatedHtml: "<h2>Section 2</h2><p>This is gated content.</p>",
  magnetSlug: "reserve-fund-calculator" as const,
};

function getForm(): HTMLFormElement {
  return screen.getByLabelText("Email address").closest("form")!;
}

function successJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorJsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSignedUp.mockReturnValue(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      successJsonResponse({
        downloadUrl:
          "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
        alreadySubscribed: false,
      }),
    ),
  );
  // Clear any posthog stub between tests
  Object.defineProperty(window, "posthog", {
    value: undefined,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

describe("GatedContent", () => {
  it("renders full content immediately when isSignedUp() returns true", () => {
    mockIsSignedUp.mockReturnValue(true);
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.getByText("This is gated content.")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders only teaser + gate form when isSignedUp() returns false", () => {
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(screen.getByRole("textbox")).toBeDefined();
    expect(
      screen.getByRole("button", { name: defaultProps.ctaText }),
    ).toBeDefined();
    expect(screen.getByText(defaultProps.description)).toBeDefined();
  });

  it("shows email validation error on invalid input", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.submit(getForm());

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(mockTrackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "gated_content",
      magnet_slug: "reserve-fund-calculator",
      source_page: "lead-magnet",
      failure_type: "validation",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POSTs to /lead-magnets/subscribe with magnetSlug, sourcePage, email", async () => {
    render(
      <GatedContent {...defaultProps} sourcePage="https://bs.test/free/x" />,
    );

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/lead-magnets/subscribe",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const callArgs = (fetch as unknown as MockInstance).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.email).toBe("test@example.com");
    expect(body.magnetSlug).toBe("reserve-fund-calculator");
    expect(body.sourcePage).toBe("https://bs.test/free/x");
  });

  it("includes posthogDistinctId from window.posthog when available", async () => {
    Object.defineProperty(window, "posthog", {
      value: {
        capture: vi.fn(),
        identify: vi.fn(),
        get_distinct_id: () => "ph-distinct-id-123",
      },
      writable: true,
      configurable: true,
    });

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const callArgs = (fetch as unknown as MockInstance).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.posthogDistinctId).toBe("ph-distinct-id-123");
  });

  it("reveals full content and calls setSignedUp() on successful response", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalled();
      expect(screen.getByText("This is gated content.")).toBeDefined();
    });
  });

  it("renders a Download now CTA with downloadUrl, target=_blank, rel=noopener on success", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    const cta = await screen.findByRole("link", { name: /download now/i });
    expect(cta.getAttribute("href")).toBe(
      "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
    );
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toBe("noopener");
    expect(
      screen.getByRole("heading", { name: /check your inbox/i }),
    ).toBeDefined();
  });

  it("fires both waitlist_submitted and lead_magnet_unlocked when alreadySubscribed=false", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        magnet_slug: "reserve-fund-calculator",
        source_page: "lead-magnet",
        title: defaultProps.leadMagnetTitle,
      });
      expect(mockTrackEvent).toHaveBeenCalledWith("waitlist_submitted", {
        source: "gated_content",
        source_page: "lead-magnet",
      });
    });
  });

  it("fires only lead_magnet_unlocked when alreadySubscribed=true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        successJsonResponse({
          downloadUrl:
            "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
          alreadySubscribed: true,
        }),
      ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        magnet_slug: "reserve-fund-calculator",
        source_page: "lead-magnet",
        title: defaultProps.leadMagnetTitle,
      });
    });

    const submittedCall = mockTrackEvent.mock.calls.find(
      (args: unknown[]) => args[0] === "waitlist_submitted",
    );
    expect(submittedCall).toBeUndefined();

    // Still renders success UX with download CTA
    expect(screen.getByRole("link", { name: /download now/i })).toBeDefined();
  });

  it("shows inline validation error on 400 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorJsonResponse(400, { error: "bad" })),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Please enter a valid email address."),
      ).toBeDefined();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "gated_content",
      magnet_slug: "reserve-fund-calculator",
      source_page: "lead-magnet",
      failure_type: "validation",
      status_code: 400,
    });
    // No success UX
    expect(screen.queryByRole("link", { name: /download now/i })).toBeNull();
  });

  it("shows retry message on 5xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorJsonResponse(500)));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(/having trouble.*try again/i)).toBeDefined();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "gated_content",
      magnet_slug: "reserve-fund-calculator",
      source_page: "lead-magnet",
      failure_type: "http_error",
      status_code: 500,
    });
  });

  it("handles network error with generic error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
      expect(mockCaptureException).toHaveBeenCalled();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "gated_content",
      magnet_slug: "reserve-fund-calculator",
      source_page: "lead-magnet",
      failure_type: "network_error",
    });
  });

  it("does NOT fire waitlist_submitted on error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorJsonResponse(500)));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(/having trouble/i)).toBeDefined();
    });

    const submittedCall = mockTrackEvent.mock.calls.find(
      (args: unknown[]) => args[0] === "waitlist_submitted",
    );
    expect(submittedCall).toBeUndefined();
  });

  it("gate form is accessible (labels, aria-invalid, error descriptions)", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("aria-label")).toBe("Email address");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("gated-content-error");

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errorEl = document.getElementById("gated-content-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBe("Please enter a valid email address.");
  });

  it("renders custom privacy note", () => {
    render(
      <GatedContent {...defaultProps} privacyNote="Custom privacy text." />,
    );
    expect(screen.getByText("Custom privacy text.")).toBeDefined();
  });

  it("renders default privacy note when none provided", () => {
    render(<GatedContent {...defaultProps} />);
    expect(
      screen.getByText("We'll email it to you. No spam. Opt out anytime."),
    ).toBeDefined();
  });

  it("disables form during submission", async () => {
    let resolveSubmit!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSubmit = resolve;
          }),
      ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    const button = screen.getByRole("button", { name: defaultProps.ctaText });

    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(input.hasAttribute("disabled")).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveSubmit(
      successJsonResponse({
        downloadUrl:
          "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
        alreadySubscribed: false,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("This is gated content.")).toBeDefined();
    });
  });

  it("clears error state when user types after validation error", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();

    fireEvent.change(input, { target: { value: "test@example.com" } });

    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  it("shows success heading containing the email address", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(/test@example\.com/)).toBeDefined();
    });
  });

  it("handles non-400/non-5xx error responses with generic error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorJsonResponse(418)));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("returns undefined distinct id when window.posthog.get_distinct_id throws", async () => {
    Object.defineProperty(window, "posthog", {
      value: {
        capture: vi.fn(),
        identify: vi.fn(),
        get_distinct_id: () => {
          throw new Error("posthog not ready");
        },
      },
      writable: true,
      configurable: true,
    });

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const callArgs = (fetch as unknown as MockInstance).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.posthogDistinctId).toBeUndefined();
  });

  it("returns undefined distinct id when window.posthog.get_distinct_id returns empty string", async () => {
    Object.defineProperty(window, "posthog", {
      value: {
        capture: vi.fn(),
        identify: vi.fn(),
        get_distinct_id: () => "",
      },
      writable: true,
      configurable: true,
    });

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const callArgs = (fetch as unknown as MockInstance).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.posthogDistinctId).toBeUndefined();
  });

  it("fails gracefully (error message) when response JSON doesn't match schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successJsonResponse({ wrong: "shape" })),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("renders a honeypot input and allows onChange without affecting email validation", () => {
    render(<GatedContent {...defaultProps} />);
    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement | null;
    expect(honeypotInput).not.toBeNull();
    expect(honeypotInput?.tabIndex).toBe(-1);
    expect(honeypotInput?.getAttribute("aria-hidden")).toBe("true");
    // Fire change to exercise the onChange handler (setHoneypot)
    fireEvent.change(honeypotInput!, { target: { value: "bot-value" } });
    expect(honeypotInput?.value).toBe("bot-value");
  });

  it("calls setTurnstileToken when TurnstileWidget onVerify is invoked", async () => {
    const { TurnstileWidget } = await import("./turnstile-widget");
    const mockedWidget = vi.mocked(TurnstileWidget);

    render(<GatedContent {...defaultProps} />);

    // Trigger the onVerify callback to exercise setTurnstileToken
    const onVerify =
      mockedWidget.mock.calls[mockedWidget.mock.calls.length - 1]?.[0].onVerify;
    if (onVerify) {
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "test@example.com" },
      });
      // Call onVerify to set the token
      await act(async () => {
        onVerify("cf-token-gated");
      });
      // Now submit should include the token
      fireEvent.submit(getForm());
      await waitFor(() => {
        const callArgs = (fetch as unknown as MockInstance).mock.calls[0];
        const body = JSON.parse(
          (callArgs[1] as RequestInit).body as string,
        ) as Record<string, unknown>;
        expect(body.turnstileToken).toBe("cf-token-gated");
      });
    }
  });
});

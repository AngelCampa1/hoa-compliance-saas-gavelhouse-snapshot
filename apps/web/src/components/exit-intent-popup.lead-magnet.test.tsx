import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

vi.mock("../lib/sentry-client", () => ({
  captureException: vi.fn(),
}));

vi.mock("../lib/exit-popup-utils", () => ({
  SUPPRESS_DAYS: 30,
  isSignedUp: vi.fn(() => false),
  isWithinSuppressWindow: vi.fn(() => false),
  setSuppressed: vi.fn(),
  setSignedUp: vi.fn(),
  detectScrollBack: vi.fn(() => false),
}));

vi.mock("../lib/signup-attribution", () => ({
  persistSignupAttribution: vi.fn(),
  resolveSignupAttribution: vi.fn(() => ({})),
}));

vi.mock("../lib/lead-magnet-subscribe", () => ({
  readPosthogDistinctId: vi.fn(() => "ph-123"),
  subscribeToLeadMagnet: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { subscribeToLeadMagnet } from "../lib/lead-magnet-subscribe";
import { ExitIntentPopup } from "./exit-intent-popup";

const defaultProps = {
  apiUrl: "https://api.gavelhouse.test",
  siteName: "Gavelhouse",
  headline: "Before you go: grab the guide",
  description: "Reserve requirements by state.",
  ctaText: "Send me the guide",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox for the download.",
  loadingText: "Sending now...",
  leadMagnet: {
    slug: "reserve-fund-calculator",
    title: "Reserve Fund Calculator",
    description: "Calculate funding gaps fast.",
  },
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
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExitIntentPopup lead magnet states", () => {
  it("uses the custom loading text while the lead magnet request is pending", async () => {
    let resolvePromise:
      | ((value: { downloadUrl: string; alreadySubscribed: boolean }) => void)
      | undefined;
    vi.mocked(subscribeToLeadMagnet).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    expect(
      screen.getByRole("button", { name: "Sending now..." }),
    ).toBeDefined();

    act(() => {
      resolvePromise?.({
        downloadUrl:
          "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
        alreadySubscribed: false,
      });
    });

    expect(await screen.findByText("Download now")).toBeDefined();
  });

  it("renders the lead magnet success state and tracks secondary CTA clicks", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl:
        "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
      alreadySubscribed: false,
    });

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    const pricingLink = await screen.findByRole("link", {
      name: "See Pricing",
    });
    expect(pricingLink).toHaveAttribute("href", "/pricing/");

    fireEvent.click(pricingLink);

    expect(trackEvent).toHaveBeenCalledWith(
      "lead_magnet_secondary_trial_click",
      {
        magnet_slug: "reserve-fund-calculator",
        placement: "popup",
        source_page: "exit-popup",
        target: "/pricing/",
      },
    );
  });

  it("captures unexpected lead magnet failures and shows the generic error", async () => {
    const error = new Error("network");
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(error);

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeDefined();
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("tracks lead magnet validation failures from the popup", async () => {
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(
      Object.assign(new Error("invalid"), { status: 400 }),
    );

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    expect(
      await screen.findByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "exit_popup_lead_magnet",
      source_page: "exit-popup",
      failure_type: "validation",
      status_code: 400,
      magnet_slug: "reserve-fund-calculator",
    });
  });

  it("tracks lead magnet HTTP failures from the popup", async () => {
    const error = Object.assign(new Error("server"), { status: 500 });
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(error);

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "exit_popup_lead_magnet",
      source_page: "exit-popup",
      failure_type: "http_error",
      status_code: 500,
      magnet_slug: "reserve-fund-calculator",
    });
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("hides the popup after 4 seconds on lead magnet success", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl: "https://gavelhouse.app/downloads/guide.pdf",
      alreadySubscribed: false,
    });

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    // Wait for success state
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeDefined();
    });

    // Advance 4 seconds — popup should hide (line 269: setVisible(false))
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("sets turnstileToken when TurnstileWidget onVerify fires in lead magnet path", async () => {
    const { TurnstileWidget } = await import("./turnstile-widget");
    const mockedWidget = vi.mocked(TurnstileWidget);

    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl: "https://gavelhouse.app/downloads/guide.pdf",
      alreadySubscribed: false,
    });

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    // Call onVerify to cover setTurnstileToken (line 87)
    const onVerify =
      mockedWidget.mock.calls[mockedWidget.mock.calls.length - 1]?.[0].onVerify;
    if (onVerify) onVerify("cf-token-popup");

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send me the guide" }));

    await waitFor(() => {
      expect(vi.mocked(subscribeToLeadMagnet)).toHaveBeenCalledWith(
        expect.objectContaining({ turnstileToken: "cf-token-popup" }),
      );
    });
  });
});

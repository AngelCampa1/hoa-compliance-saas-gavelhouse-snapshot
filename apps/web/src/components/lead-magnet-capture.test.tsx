import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

vi.mock("../lib/sentry-client", () => {
  const captureException = vi.fn();
  return {
    captureException,
    reportUserFacingError: vi.fn(
      (error: unknown, message: string, context: unknown) => {
        captureException(error, context);
        return message;
      },
    ),
  };
});

vi.mock("../lib/lead-magnet-subscribe", () => ({
  readPosthogDistinctId: vi.fn(() => "ph-123"),
  subscribeToLeadMagnet: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { subscribeToLeadMagnet } from "../lib/lead-magnet-subscribe";
import { LeadMagnetCapture } from "./lead-magnet-capture";

const defaultProps = {
  apiUrl: "https://api.gavelhouse.test",
  offer: {
    slug: "reserve-fund-calculator",
    title: "Reserve Fund Calculator",
    description: "Calculate funding gaps fast.",
    ctaText: "Get the guide",
    destination: "/free/reserve-fund-calculator/",
  },
  sourcePage: "/resources/guides/hoa-reserve-study-guide/",
  placement: "inline" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LeadMagnetCapture", () => {
  it("throws when apiUrl is missing", () => {
    expect(() =>
      render(<LeadMagnetCapture {...defaultProps} apiUrl="" />),
    ).toThrow("PUBLIC_API_URL is required for lead magnet capture components.");
  });

  it("tracks impressions on mount", () => {
    render(<LeadMagnetCapture {...defaultProps} />);

    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_impression", {
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
    });
  });

  it("shows validation errors for invalid email input", async () => {
    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "lead_magnet_capture",
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
      failure_type: "validation",
    });
  });

  it("renders the success state with a download link and pricing CTA", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl:
        "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
      alreadySubscribed: false,
    });

    render(
      <LeadMagnetCapture
        {...defaultProps}
        secondaryCtaText="See Plans & Pricing"
        secondaryCtaTarget="/#pricing"
      />,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(await screen.findByText("Check your inbox")).toBeDefined();
    expect(screen.getByRole("link", { name: "Download now" })).toHaveAttribute(
      "href",
      "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
    );
    expect(
      screen.getByRole("link", { name: "See Plans & Pricing" }),
    ).toHaveAttribute("href", "/#pricing");
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_download_ready", {
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
      already_subscribed: false,
    });
  });

  it("shows the duplicate message for 409 responses", async () => {
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(
      Object.assign(new Error("duplicate"), { status: 409 }),
    );

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText(
        "You're already subscribed. Use the direct download below.",
      ),
    ).toBeDefined();
  });

  it("shows the validation message for 400 responses from the API", async () => {
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(
      Object.assign(new Error("invalid"), { status: 400 }),
    );

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText("Please enter a valid email address."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "lead_magnet_capture",
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
      failure_type: "validation",
      status_code: 400,
    });
  });

  it("captures unexpected errors and shows the generic message", async () => {
    const error = new Error("network");
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(error);

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "lead_magnet_capture",
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
      failure_type: "network_error",
    });
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { source: "lead-magnet-capture" },
        extra: expect.objectContaining({
          magnetSlug: "reserve-fund-calculator",
          placement: "inline",
        }),
      }),
    );
  });

  it("tracks HTTP lead magnet failures with status codes", async () => {
    const error = Object.assign(new Error("server"), { status: 500 });
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(error);

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "lead_magnet_capture",
      magnet_slug: "reserve-fund-calculator",
      placement: "inline",
      source_page: "/resources/guides/hoa-reserve-study-guide/",
      failure_type: "http_error",
      status_code: 500,
    });
  });

  it("disables submit until Turnstile verifies when configured", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "site-key-test");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const mockedWidget = vi.mocked(TurnstileWidget);

    render(<LeadMagnetCapture {...defaultProps} />);

    const submitButton = screen.getByRole("button", { name: "Get the guide" });
    expect(submitButton).toBeDisabled();

    const onVerify = mockedWidget.mock.calls[0]?.[0].onVerify;
    act(() => {
      onVerify?.("cf-token-test");
    });

    expect(submitButton).not.toBeDisabled();
  });

  it("clears an error state once the user types again", async () => {
    vi.mocked(subscribeToLeadMagnet).mockRejectedValue(
      Object.assign(new Error("invalid"), { status: 400 }),
    );

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(
      await screen.findByText("Please enter a valid email address."),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board-2@example.com" },
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Please enter a valid email address."),
      ).toBeNull();
    });
  });

  it("tracks secondary CTA clicks from the success state", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl:
        "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
      alreadySubscribed: true,
    });

    render(
      <LeadMagnetCapture
        {...defaultProps}
        secondaryCtaText="See Plans & Pricing"
        secondaryCtaTarget="/#pricing"
      />,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    const pricingLink = await screen.findByRole("link", {
      name: "See Plans & Pricing",
    });
    fireEvent.click(pricingLink);

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        "lead_magnet_secondary_trial_click",
        {
          magnet_slug: "reserve-fund-calculator",
          placement: "inline",
          source_page: "/resources/guides/hoa-reserve-study-guide/",
          target: "/#pricing",
        },
      );
    });
  });

  it("still renders the secondary CTA when the response does not include a direct download", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl: "",
      alreadySubscribed: true,
    });

    render(<LeadMagnetCapture {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    expect(await screen.findByText("Check your inbox")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Download now" })).toBeNull();
    expect(screen.getByRole("link", { name: "See Pricing" })).toBeDefined();
  });

  it("passes companyWebsite and turnstileToken to subscribeToLeadMagnet when provided", async () => {
    vi.mocked(subscribeToLeadMagnet).mockResolvedValue({
      downloadUrl: "https://example.com/dl.pdf",
      alreadySubscribed: false,
    });

    const { TurnstileWidget } = await import("./turnstile-widget");
    const mockedWidget = vi.mocked(TurnstileWidget);

    render(<LeadMagnetCapture {...defaultProps} />);

    // Simulate Turnstile verifying
    const onVerify = mockedWidget.mock.calls[0]?.[0].onVerify;
    if (onVerify) act(() => onVerify("cf-token-test"));

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "board@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Get the guide" }));

    await waitFor(() => {
      expect(vi.mocked(subscribeToLeadMagnet)).toHaveBeenCalledWith(
        expect.objectContaining({
          turnstileToken: "cf-token-test",
        }),
      );
    });
  });

  it("renders a honeypot input that is hidden from real users", () => {
    render(<LeadMagnetCapture {...defaultProps} />);
    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement | null;
    expect(honeypotInput).not.toBeNull();
    expect(honeypotInput?.tabIndex).toBe(-1);
    expect(honeypotInput?.getAttribute("aria-hidden")).toBe("true");
    expect(honeypotInput?.getAttribute("autocomplete")).toBe("off");
  });

  it("honeypot onChange updates its value", () => {
    render(<LeadMagnetCapture {...defaultProps} />);
    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement;
    fireEvent.change(honeypotInput, { target: { value: "spam" } });
    expect(honeypotInput.value).toBe("spam");
  });
});

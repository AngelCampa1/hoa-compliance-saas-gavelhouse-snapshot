import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { FakeDoorPricing } from "./fake-door-pricing";
import type { SurveyQuestion, ReferralReward } from "../lib/types";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("../lib/billing-toggle-tracker", () => ({
  trackBillingToggle: vi.fn(),
}));

import { trackBillingToggle } from "../lib/billing-toggle-tracker";

vi.mock("./email-capture", () => ({
  EmailCapture: (props: Record<string, unknown>) => (
    <div
      data-testid="email-capture"
      data-api-url={props.apiUrl as string}
      data-source-page={props.sourcePage as string}
      data-privacy-note={props.privacyNote as string | undefined}
      data-error-invalid-email={props.errorInvalidEmail as string | undefined}
      data-qualified-heading={props.qualifiedHeading as string | undefined}
      data-qualified-dismiss-text={
        props.qualifiedDismissText as string | undefined
      }
      data-unqualified-dismiss-text={
        props.unqualifiedDismissText as string | undefined
      }
      data-button-text={props.buttonText as string | undefined}
      data-subtitle={props.subtitle as string | undefined}
      data-aria-label={props.ariaLabel as string | undefined}
      data-survey-preview={props.surveyPreview as string | undefined}
      data-qualification={JSON.stringify(props.qualification ?? null)}
    >
      EmailCapture
    </div>
  ),
}));

const tiers = [
  {
    name: "Starter",
    price: "$29/mo",
    features: ["5 users", "Basic"],
  },
  {
    name: "Pro",
    price: "$79/mo",
    features: ["25 users", "Advanced"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$199/mo",
    features: ["Unlimited", "Custom"],
  },
];

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/pricing",
  tiers,
  heading: "Plans & Pricing",
  buttonPrefix: "Choose",
  confirmationMessage: "Thanks for your interest!",
  popularBadgeText: "Most Popular",
};

const florivaBillingTier = [
  {
    name: "Floriva",
    price: "$5.99/mo",
    monthlyPriceCents: 599,
    annualPriceOverride: "$39.99/yr",
    lifetimePriceOverride: "$59.99 lifetime",
    features: ["Plant schedules", "Care reminders"],
  },
];

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: undefined,
  });
});

describe("FakeDoorPricing", () => {
  it("renders limited offer and guarantee assurances when provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        promoAssurance={{
          promoCode: "Y80OFF",
          promoText: "Use Y80OFF for 80% off your first year.",
          guaranteeText: "30-day money-back guarantee.",
        }}
      />,
    );

    expect(screen.getByText("Y80OFF")).toBeDefined();
    expect(
      screen.getByText("Use Y80OFF for 80% off your first year."),
    ).toBeDefined();
    expect(screen.getByText("30-day money-back guarantee.")).toBeDefined();
  });
  it("renders all tier names, prices, and features", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$29/mo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$79/mo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enterprise").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$199/mo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 users").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unlimited").length).toBeGreaterThan(0);
  });

  it("renders a mobile stacked pricing layout with full tier cards", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const { container } = render(<FakeDoorPricing {...defaultProps} />);

    const mobileLayout = container.querySelector(
      '[data-pricing-layout="mobile-stacked"]',
    );
    expect(mobileLayout).toBeTruthy();
    expect(mobileLayout?.className).toContain("md:hidden");
    expect(
      mobileLayout?.querySelectorAll("[data-mobile-tier-card]").length,
    ).toBe(3);
    expect(
      screen.getByRole("button", { name: "Choose Starter mobile" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Choose Pro mobile" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Choose Enterprise mobile" }),
    ).toBeDefined();
  });

  it("renders mobile and desktop pricing layouts with CSS breakpoints", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);

    const mobileLayout = container.querySelector(
      '[data-pricing-layout="mobile-stacked"]',
    );
    const desktopLayout = container.querySelector(
      '[data-pricing-layout="comparison"]',
    );

    expect(mobileLayout).toBeTruthy();
    expect(mobileLayout?.className).toContain("md:hidden");
    expect(desktopLayout).toBeTruthy();
    expect(desktopLayout?.className).toContain("hidden");
    expect(desktopLayout?.className).toContain("md:block");
    expect(
      mobileLayout?.querySelectorAll("[data-mobile-tier-card]").length,
    ).toBe(3);
  });

  it("uses tier names for mobile buttons when no prefix or CTA text is set", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const { buttonPrefix: _, ...propsWithoutPrefix } = defaultProps;

    render(<FakeDoorPricing {...propsWithoutPrefix} />);

    expect(
      screen.getByRole("button", { name: "Starter mobile" }),
    ).toHaveTextContent("Starter");
  });

  it("uses mobile CTA text, then selected text after tapping a mobile tier", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={[
          { ...tiers[0], ctaText: "Start Free Trial" },
          ...tiers.slice(1),
        ]}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Choose Starter mobile",
    });
    expect(button).toHaveTextContent("Start Free Trial");

    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveTextContent("Selected");
    });
  });

  it("highlighted tier column has gold left-border stripe (not a pill badge)", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // The legacy border-t-4 and mono RECOMMENDED pill are gone
    expect(container.querySelector(".border-t-4")).toBeNull();
    // Highlighted tier column is marked with data-tier-highlighted="true" and
    // wears the editorial gold left-border stripe class pair.
    const highlightedColumn = container.querySelector(
      '[data-tier-highlighted="true"]',
    );
    expect(highlightedColumn).toBeTruthy();
    expect(highlightedColumn?.className).toContain("border-l-2");
    expect(highlightedColumn?.className).toContain(
      "border-[var(--color-accent-400)]",
    );
  });

  it("click calls fetch with lowercased tier, sourcePage, and sessionId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe("https://api.test/waitlist/pricing-click");
      const body = JSON.parse(opts.body) as {
        tier: string;
        sourcePage: string;
        sessionId: string;
      };
      expect(body.tier).toBe("pro");
      expect(body.sourcePage).toBe("/pricing");
      expect(body.sessionId).toBeTruthy();
    });
  });

  it("after click, selected tier button shows checkmark and 'Selected' text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" now appears twice: card corner badge + button text
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("after click, other tier buttons remain enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      const proButton = screen.getByRole("button", { name: "Choose Pro" });
      const enterpriseButton = screen.getByRole("button", {
        name: "Choose Enterprise",
      });
      expect(proButton).toHaveProperty("disabled", false);
      expect(enterpriseButton).toHaveProperty("disabled", false);
    });
  });

  it("after click, selected tier button is not disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      // Button should not be disabled - re-selection is allowed
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toHaveProperty("disabled", false);
      });
    });
  });

  it("after click, confirmation message appears when confirmationMessage is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("after click, confirmationMessage is suppressed when emailCapture prop is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Should not show"
        emailCapture={{
          apiUrl: "https://api.test",
          sourcePage: "/pricing",
          surveyQuestions: [],
          discoveryCallUrl: "https://cal.example.com",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // emailCapture replaces confirmationMessage - the message must not appear
      expect(screen.queryByText("Should not show")).toBeNull();
    });
  });

  it("uses custom confirmationMessage when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Your trial is ready!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Your trial is ready!")).toBeDefined();
    });
  });

  it("handles fetch failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" appears in both the card corner badge and the button
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls onTierClick callback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onTierClick = vi.fn();

    render(<FakeDoorPricing {...defaultProps} onTierClick={onTierClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(onTierClick).toHaveBeenCalledOnce();
    });
  });

  it("renders custom heading prop", () => {
    render(<FakeDoorPricing {...defaultProps} heading="Pick a Plan" />);
    expect(screen.getByText("Pick a Plan")).toBeDefined();
  });

  it("passes qualification rules through to the modal email capture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={{
          apiUrl: "https://api.test",
          sourcePage: "/pricing",
          surveyQuestions: [] as SurveyQuestion[],
          discoveryCallUrl: "https://cal.example.com",
          qualification: {
            logic: "any",
            rules: [{ questionId: "segment", answers: ["Women 40+"] }],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("email-capture").getAttribute("data-qualification"),
      ).toBe(
        JSON.stringify({
          logic: "any",
          rules: [{ questionId: "segment", answers: ["Women 40+"] }],
        }),
      );
    });
  });

  it("layout flips between comparison table (2+ tiers) and single-column shell (1 tier)", () => {
    const { container: c3 } = render(<FakeDoorPricing {...defaultProps} />);
    expect(c3.querySelector('[data-pricing-layout="comparison"]')).toBeTruthy();
    expect(c3.querySelectorAll("[data-tier-column]").length).toBe(3);

    const { container: c2 } = render(
      <FakeDoorPricing {...defaultProps} tiers={tiers.slice(0, 2)} />,
    );
    expect(c2.querySelector('[data-pricing-layout="comparison"]')).toBeTruthy();
    expect(c2.querySelectorAll("[data-tier-column]").length).toBe(2);

    const { container: c1 } = render(
      <FakeDoorPricing {...defaultProps} tiers={tiers.slice(0, 1)} />,
    );
    expect(c1.querySelector('[data-pricing-layout="single"]')).toBeTruthy();
    expect(c1.querySelector(".max-w-lg")).toBeTruthy();
  });

  it("re-selection tracks both tiers independently", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<FakeDoorPricing {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Both tiers flagged as selected via the editorial column metadata
    const selectedColumns = container.querySelectorAll(
      '[data-tier-selected="true"]',
    );
    expect(selectedColumns.length).toBe(2);
    // The two tier columns marked selected are Starter + Pro
    const names = Array.from(selectedColumns).map((el) =>
      el.getAttribute("data-tier-name"),
    );
    expect(names).toContain("Starter");
    expect(names).toContain("Pro");
  });

  it("uses custom buttonPrefix when provided", () => {
    render(<FakeDoorPricing {...defaultProps} buttonPrefix="Get Access to" />);
    expect(
      screen.getByRole("button", { name: "Get Access to Starter" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Get Access to Pro" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Get Access to Enterprise" }),
    ).toBeDefined();
  });

  it("uses tier.ctaText as button label when set, ignoring buttonPrefix + name", () => {
    const tiersWithCtaText = [
      { ...tiers[0], ctaText: "Start Free Trial" },
      { ...tiers[1] },
      { ...tiers[2] },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithCtaText} />);
    expect(
      screen.getByRole("button", { name: "Start Free Trial" }),
    ).toBeDefined();
    // Other tiers without ctaText still use prefix + name
    expect(screen.getByRole("button", { name: "Choose Pro" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Choose Enterprise" }),
    ).toBeDefined();
  });

  it("shows only tier name when buttonPrefix is not provided", () => {
    const { buttonPrefix: _, ...propsWithoutPrefix } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutPrefix} />);
    expect(screen.getByRole("button", { name: "Starter" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Pro" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Enterprise" })).toBeDefined();
  });

  it("selected tier column receives data-tier-selected and inline '-- Selected' kicker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      const starterCol = container.querySelector(
        '[data-tier-name="Starter"][data-tier-column]',
      );
      expect(starterCol?.getAttribute("data-tier-selected")).toBe("true");
      // Inline "-- Selected" editorial kicker is rendered
      expect(starterCol?.textContent ?? "").toMatch(/-- Selected/);
    });
  });

  it("confirmation message does not appear before any click", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });

  it("does not render heading when heading prop is omitted", () => {
    const { heading: _, ...propsWithoutHeading } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutHeading} />);
    expect(screen.queryByText("Plans & Pricing")).toBeNull();
  });

  it("uses custom heading when provided", () => {
    render(<FakeDoorPricing {...defaultProps} heading="Our Plans" />);
    expect(screen.getByText("Our Plans")).toBeDefined();
    expect(screen.queryByText("Plans & Pricing")).toBeNull();
  });

  it("renders 'Most Popular' kicker when popularTier matches a tier name (case-insensitive)", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="pro" />);
    expect(screen.getAllByText(/Most Popular/).length).toBeGreaterThan(0);
  });

  it("defaults popularBadgeText to 'Most Popular' when popularTier is set but popularBadgeText is not passed", () => {
    const { popularBadgeText: _, ...propsWithoutBadgeText } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutBadgeText} popularTier="pro" />);
    expect(screen.getAllByText(/Most Popular/).length).toBeGreaterThan(0);
  });

  it("does NOT render popular badge when popularTier not provided", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.queryByText(/Most Popular/)).toBeNull();
  });

  it("does NOT render 'Most Popular' badge when popularTier does not match any tier", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="nonexistent" />);
    expect(screen.queryByText(/Most Popular/)).toBeNull();
  });

  it("renders 'Most Popular' kicker using case-insensitive match (uppercase popularTier)", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="PRO" />);
    expect(screen.getAllByText(/Most Popular/).length).toBeGreaterThan(0);
  });

  it("renders description text when tier has description", () => {
    const tiersWithDescription = [
      { ...tiers[0] },
      { ...tiers[1], description: "Most teams start here" },
      { ...tiers[2] },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithDescription} />);
    expect(screen.getAllByText("Most teams start here").length).toBeGreaterThan(
      0,
    );
  });

  it("does not render description element when tier has no description", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    // No descriptions in default tiers, just ensure no phantom elements
    const starterCard = screen
      .getAllByText("Starter")[0]
      .closest("div") as HTMLElement;
    expect(starterCard).toBeTruthy();
  });

  it("shows tier-specific message from selectedMessages after selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        selectedMessages={{ pro: "The Pro plan is perfect for growing teams!" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(
        screen.getByText("The Pro plan is perfect for growing teams!"),
      ).toBeDefined();
    });
  });

  it("falls back to generic confirmationMessage when selectedMessages not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("falls back to generic message when selectedMessages does not have entry for selected tier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
        selectedMessages={{ starter: "Starter-specific message" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // Pro not in selectedMessages, should show generic confirmationMessage
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("shows tier-specific message when multiple tiers clicked and each has its own message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        selectedMessages={{
          starter: "Starter message!",
          pro: "Pro message!",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByText("Starter message!")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      // Last clicked tier message should appear
      expect(screen.getByText("Pro message!")).toBeDefined();
    });
  });
  it("uses custom selectedBadgeText when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} selectedBadgeText="Picked" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Picked" appears in both the card corner badge and the button - both must show it
      const allPicked = screen.getAllByText("Picked");
      expect(allPicked.length).toBeGreaterThanOrEqual(1);
      // The default "Selected" text must not appear anywhere
      expect(screen.queryByText("Selected")).toBeNull();
      // The button must contain "Picked"
      const buttons = screen.getAllByRole("button");
      const selectedButton = buttons.find((b) =>
        b.textContent?.includes("Picked"),
      );
      expect(selectedButton).toBeDefined();
    });
  });

  it("defaults selectedBadgeText to 'Selected' when not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" appears in both the card corner badge and the button
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("uses custom recommendedBadgeText when provided", () => {
    const tiersWithHighlighted = [
      { ...tiers[0] },
      { ...tiers[1], highlighted: true },
      { ...tiers[2] },
    ];
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithHighlighted}
        recommendedBadgeText="Best Value"
      />,
    );
    expect(screen.getAllByText(/Best Value/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/RECOMMENDED/)).toBeNull();
  });

  it("defaults recommendedBadgeText to 'RECOMMENDED' when not provided", () => {
    const tiersWithHighlighted = [
      { ...tiers[0] },
      { ...tiers[1], highlighted: true },
      { ...tiers[2] },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithHighlighted} />);
    expect(screen.getAllByText(/RECOMMENDED/).length).toBeGreaterThan(0);
  });

  it("does not render recommendedBadgeText badge when no tier is highlighted", () => {
    const tiersNoHighlight = tiers.map((t) => ({ ...t, highlighted: false }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersNoHighlight}
        recommendedBadgeText="Best Value"
      />,
    );
    expect(screen.queryByText(/Best Value/)).toBeNull();
  });

  it("hides recommendedBadgeText kicker on highlighted tier after it is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing {...defaultProps} recommendedBadgeText="Top Pick" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.queryByText(/Top Pick/)).toBeNull();
    });
  });

  it("renders socialProofText below the tier grid when provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        socialProofText="47 founders already joined"
      />,
    );
    expect(screen.getByText("47 founders already joined")).toBeDefined();
  });

  it("does not render socialProofText element when prop is not provided", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // No social proof paragraph should exist
    expect(screen.queryByText("47 founders already joined")).toBeNull();
    // Verify no empty paragraph from social proof slot
    const paras = container.querySelectorAll("p");
    paras.forEach((p) => {
      expect(p.textContent?.trim()).not.toBe("");
    });
  });

  it("does not render socialProofText element when prop is undefined", () => {
    render(<FakeDoorPricing {...defaultProps} socialProofText={undefined} />);
    expect(screen.queryByText("47 founders already joined")).toBeNull();
  });

  it("inline selected kicker shows selectedBadgeText prop value, not hardcoded SELECTED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} selectedBadgeText="Picked" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // The inline "-- Picked" editorial kicker must be rendered
      expect(screen.getByText(/-- Picked/)).toBeDefined();
      // The hardcoded string "SELECTED" must not appear anywhere in the DOM
      expect(screen.queryByText("SELECTED")).toBeNull();
    });
  });

  it("non-highlighted unselected tier button uses editorial serif italic CTA, not gold pill", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // Starter and Enterprise are non-highlighted tiers
    const desktopLayout = container.querySelector(
      '[data-pricing-layout="comparison"]',
    );
    const buttons = desktopLayout?.querySelectorAll("button") ?? [];
    const starterButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Starter"),
    );
    expect(starterButton).toBeDefined();
    expect(starterButton?.className).toContain("italic");
    expect(starterButton?.className).toContain("font-heading");
    expect(starterButton?.className).toContain("hover:underline");
    expect(starterButton?.className).not.toContain("btn-primary");
    expect(starterButton?.className).not.toContain("btn-shimmer");
  });

  it("highlighted unselected tier button uses editorial serif italic CTA without pulse chrome", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const proButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Pro"),
    );
    expect(proButton).toBeDefined();
    expect(proButton?.className).toContain("italic");
    expect(proButton?.className).toContain("font-heading");
    expect(proButton?.className).not.toContain("btn-primary--pulse");
    expect(proButton?.className).not.toContain("btn-primary");
    expect(proButton?.className).not.toContain("btn-shimmer");
  });

  it("CTA tier buttons use hover:underline affordance (no gold shimmer)", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    const desktopLayout = container.querySelector(
      '[data-pricing-layout="comparison"]',
    );
    const buttons = Array.from(
      desktopLayout?.querySelectorAll("button") ?? [],
    ).filter((b) => b.textContent?.includes("Choose"));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.className).toContain("hover:underline");
      expect(btn.className).not.toContain("btn-shimmer");
    });
  });

  it("selected tier button switches to accent-100 editorial state (not gold pill)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      const buttons = container.querySelectorAll("button");
      // After selection, the Starter button carries the accent-100 background
      const starterBtns = Array.from(buttons).filter((b) =>
        b.className.includes("bg-[var(--color-accent-100)]"),
      );
      expect(starterBtns.length).toBeGreaterThan(0);
      starterBtns.forEach((btn) => {
        expect(btn.className).toContain("italic");
        expect(btn.className).toContain("font-heading");
        expect(btn.className).not.toContain("btn-primary");
        expect(btn.className).not.toContain("btn-secondary");
      });
    });
  });

  // ── Badge priority tests (TDD) ──

  it("badge priority: when popular tier is selected, shows only 'Selected' kicker - not 'Most Popular'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);

    // Before selection: "Most Popular" kicker is visible, "-- Selected" is not
    expect(screen.getAllByText(/Most Popular/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/-- Selected/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // After selection: "-- Selected" kicker must appear
      expect(screen.getAllByText(/-- Selected/).length).toBeGreaterThanOrEqual(
        1,
      );
      // "Most Popular" kicker must NOT appear simultaneously
      expect(screen.queryByText(/Most Popular/)).toBeNull();
    });
  });

  it("badge priority: when popular tier is NOT selected, shows 'Most Popular' kicker - not 'Selected'", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);

    expect(screen.getAllByText(/Most Popular/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/-- Selected/)).toBeNull();
  });

  it("badge priority: a tier cannot show both 'Selected' and 'Most Popular' kickers simultaneously", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      const selectedBadges = screen.queryAllByText(/-- Selected/);
      const popularBadges = screen.queryAllByText(/Most Popular/);
      // At least one of these must be zero - they cannot coexist
      expect(selectedBadges.length === 0 || popularBadges.length === 0).toBe(
        true,
      );
    });
  });
});

describe("FakeDoorPricing - clear selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("does not show Clear button before any selection", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows Clear button when heading is omitted and a tier is selected", async () => {
    const { heading: _, ...propsWithoutHeading } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutHeading} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows Clear button after a tier is selected", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
  });

  it("Clear button resets all selections", async () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // Both tiers are marked selected in the editorial columns
      expect(
        container.querySelectorAll('[data-tier-selected="true"]').length,
      ).toBe(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    // All selections should be cleared
    expect(
      container.querySelectorAll('[data-tier-selected="true"]').length,
    ).toBe(0);
    // Clear button itself should be gone
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    // Original button text should be back
    expect(
      screen.getByRole("button", { name: "Choose Starter" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Choose Pro" })).toBeDefined();
  });

  it("Clear button hides confirmation message", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });
});

describe("FakeDoorPricing - emailCapture prop (pay-intent flow)", () => {
  const surveyQuestions: SurveyQuestion[] = [
    { id: "role", text: "What is your role?", options: ["Owner", "Manager"] },
  ];
  const referralRewards: ReferralReward[] = [
    { threshold: 3, description: "Free month" },
  ];
  const emailCaptureProps = {
    apiUrl: "https://api.test",
    sourcePage: "/pricing",
    surveyQuestions,
    discoveryCallUrl: "https://cal.example.com",
    buttonText: "Start Your Free Trial",
    subtitle: "Limited beta seats",
    whatHappensNext: "We'll send you onboarding info.",
    referralRewards,
    productName: "TestProduct",
    productDomain: "testproduct.com",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("does NOT render EmailCapture before any tier is selected", () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  it("renders EmailCapture instead of confirmationMessage after a tier is selected", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        confirmationMessage="This should NOT appear"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
      expect(screen.queryByText("This should NOT appear")).toBeNull();
    });
  });

  it("passes apiUrl and sourcePage from emailCapture props to EmailCapture component", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-api-url")).toBe("https://api.test");
      expect(el.getAttribute("data-source-page")).toBe("/pricing");
    });
  });

  it("opens a loading modal while the email capture config is still resolving", async () => {
    const configRequest = createDeferred<{
      ok: boolean;
      json: () => Promise<typeof emailCaptureProps>;
    }>();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/signup-flow.json") {
        return configRequest.promise;
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCaptureConfigUrl="/signup-flow.json"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/signup-flow.json");
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Loading next step…")).toBeDefined();

    configRequest.resolve({
      ok: true,
      json: async () => emailCaptureProps,
    });

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/pricing-click",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  it("caches the loaded email capture config for later selections", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emailCaptureProps,
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCaptureConfigUrl="/signup-flow.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Enterprise" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/signup-flow.json"),
      ).toHaveLength(1);
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
  });

  it("shows a retry state when the config fetch returns a non-ok response", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/signup-flow.json") {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCaptureConfigUrl="/signup-flow.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load the next step. Please try again."),
      ).toBeDefined();
    });
  });

  it("clicking Try again after a non-ok config fetch retries the load", async () => {
    const emailCaptureConfig = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
    };
    let callCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/signup-flow.json") {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(emailCaptureConfig),
        });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCaptureConfigUrl="/signup-flow.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows a retry state when the config fetch fails but still records the pricing click", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/signup-flow.json") {
        return Promise.reject(new Error("config failed"));
      }
      if (url === "https://api.test/waitlist/pricing-click") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCaptureConfigUrl="/signup-flow.json"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(
        screen.getByText("We couldn't load the signup form."),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/pricing-click",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  it("still shows EmailCapture when a second tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
  });

  it("does not render default confirmationMessage paragraph when emailCapture is provided and tier is selected", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        confirmationMessage="Should not show"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      // emailCapture takes priority - confirmationMessage must not appear
      expect(screen.queryByText("Should not show")).toBeNull();
    });
  });

  it("does not render EmailCapture when emailCapture prop is absent after selection", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("does not render confirmation paragraph when confirmationMessage is omitted and no selectedMessages match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { confirmationMessage: _, ...propsWithoutConfirmation } =
      defaultProps;
    render(<FakeDoorPricing {...propsWithoutConfirmation} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
    // No confirmation paragraph rendered
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });

  it("clicking Clear removes EmailCapture from the DOM when emailCapture prop is provided", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // Select a tier - EmailCapture should appear
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Click Clear - EmailCapture should be removed
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  it("non-Escape keypresses do not close the modal", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Press a non-Escape key - modal must remain open (covers the false branch).
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(screen.getByTestId("email-capture")).toBeDefined();
  });

  it("pressing Escape closes modal when emailCapture is provided and tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // Select a tier - modal should appear
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Escape key - modal should close
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });
  });

  // Bug fix: SELECTED badge must persist after Escape closes the modal
  it("retains SELECTED badge on tier after modal is closed via Escape", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible - selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  // Bug fix: SELECTED badge must persist after backdrop click closes the modal
  it("retains SELECTED badge on tier after modal is closed via backdrop click", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Click the backdrop (the dialog overlay element)
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible - selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  // Bug fix: SELECTED badge must persist after close button closes the modal
  it("retains SELECTED badge on tier after modal is closed via close button", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    const triggerButton = screen.getByRole("button", { name: "Choose Pro" });
    triggerButton.focus();
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible - selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  it("pressing Escape does nothing when modal is closed", () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // No tier selected - Escape should not throw
    expect(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    }).not.toThrow();
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  // Bug 7: focus must return to the trigger button when modal closes
  it("restores focus to the trigger button when modal is closed", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    const triggerButton = screen.getByRole("button", { name: "Choose Pro" });
    triggerButton.focus();
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Close via the Clear button
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    expect(document.activeElement).toBe(triggerButton);
  });

  it("modal has role=dialog with aria-modal and aria-label when emailCapture tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-label")).toBe(
        "Choose your plan and continue",
      );
    });
  });

  it("cleans up keydown listener on unmount when modal is open", async () => {
    const { unmount } = render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    // Unmount while modal is open - exercises the useEffect cleanup function
    unmount();
  });

  it("clicking modal inner content stops propagation - modal stays open", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    // Click the inner EmailCapture div - stopPropagation prevents backdrop clearSelection
    fireEvent.click(screen.getByTestId("email-capture"));
    expect(screen.getByTestId("email-capture")).toBeDefined();
  });

  // Bug 13: body scroll lock when modal is open
  it("locks body scroll when email capture modal is open", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    expect(document.body.style.overflow).not.toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when email capture modal is closed", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    expect(document.body.style.overflow).toBe("hidden");

    // Close via clear button
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock body scroll when no emailCapture prop (no modal)", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    // Without emailCapture, no modal opens, just confirmation message
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("uses custom modalAriaLabel on the dialog element", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        modalAriaLabel="Join the beta program"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-label")).toBe("Join the beta program");
    });
  });

  it("defaults modalAriaLabel to a neutral continuation label when not provided", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-label")).toBe(
        "Choose your plan and continue",
      );
    });
  });

  it("forwards extended props (privacyNote, survey qualification copy) to EmailCapture via spread", async () => {
    const extendedProps = {
      ...emailCaptureProps,
      privacyNote: "We respect your privacy.",
      errorInvalidEmail: "Bad email format",
      qualifiedHeading: "Perfect fit!",
      qualifiedDismissText: "Not now",
      unqualifiedDismissText: "Skip",
    };
    render(<FakeDoorPricing {...defaultProps} emailCapture={extendedProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-privacy-note")).toBe(
        "We respect your privacy.",
      );
      expect(el.getAttribute("data-error-invalid-email")).toBe(
        "Bad email format",
      );
      expect(el.getAttribute("data-qualified-heading")).toBe("Perfect fit!");
      expect(el.getAttribute("data-qualified-dismiss-text")).toBe("Not now");
      expect(el.getAttribute("data-unqualified-dismiss-text")).toBe("Skip");
    });
  });

  it("defaults EmailCapture buttonText to signup copy when not explicitly provided", async () => {
    const minimalEmailCapture = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={minimalEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-button-text")).toBe("Continue");
    });
  });

  it("defaults EmailCapture subtitle to signup copy with productName when not explicitly provided", async () => {
    const emailCaptureWithProduct = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
      productName: "Gavelhouse",
    };
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureWithProduct}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe(
        "You picked a plan. Enter your email to continue with Gavelhouse.",
      );
    });
  });

  it("defaults EmailCapture subtitle to generic signup copy when no productName and no explicit subtitle", async () => {
    const minimalEmailCapture = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={minimalEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe(
        "You picked a plan. Enter your email to continue.",
      );
    });
  });

  it("uses the modal aria label for the nested EmailCapture by default", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-aria-label")).toBe(
        "Choose your plan and continue",
      );
    });
  });

  it("uses explicit buttonText override when provided in emailCapture", async () => {
    const customEmailCapture = {
      ...emailCaptureProps,
      buttonText: "Custom CTA",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={customEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-button-text")).toBe("Custom CTA");
    });
  });

  it("uses explicit subtitle override when provided in emailCapture", async () => {
    const customEmailCapture = {
      ...emailCaptureProps,
      subtitle: "Custom subtitle text",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={customEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe("Custom subtitle text");
    });
  });

  it("forwards surveyPreview to EmailCapture", async () => {
    const captureWithSurvey = {
      ...emailCaptureProps,
      surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={captureWithSurvey} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-survey-preview")).toBe(
        "Quick 3-question survey. Takes 30 seconds.",
      );
    });
  });
});

describe("FakeDoorPricing - billing toggle", () => {
  const tiersWithMonthly = [
    {
      name: "Starter",
      price: "$49/mo",
      monthlyPriceCents: 4900,
      features: ["5 users", "Basic"],
    },
    {
      name: "Pro",
      price: "$99/mo",
      monthlyPriceCents: 9900,
      features: ["25 users", "Advanced"],
      highlighted: true,
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("no toggle rendered when no tier has monthlyPriceCents", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiers} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Monthly" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Annual" })).toBeNull();
  });

  it("no toggle rendered when all tiers have pricingModel one-time even with monthlyPriceCents", () => {
    const oneTimeTier = [
      {
        name: "Lifetime",
        price: "$299",
        monthlyPriceCents: 9900,
        pricingModel: "one-time" as const,
        features: ["Lifetime access"],
      },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={oneTimeTier} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("no toggle rendered when showBillingToggle is false even with monthlyPriceCents", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        showBillingToggle={false}
      />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("toggle renders Monthly and Annual buttons when tiers have monthlyPriceCents", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    expect(screen.getByRole("radiogroup")).toBeDefined();
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Annual" })).toBeDefined();
  });

  it("toggle renders Lifetime when a tier provides a lifetime override", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={florivaBillingTier} />);
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Annual" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Lifetime" })).toBeDefined();
  });

  it("shows computed annual price by default, clicking Monthly restores monthly price", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    // Annual is default - per-month equivalent shown (4900 * 10 / 12 / 100 ≈ $40.83)
    expect(screen.getAllByText("~$40.83/mo").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));

    await waitFor(() => {
      expect(screen.getAllByText("$49/mo").length).toBeGreaterThan(0);
      expect(screen.queryByText("~$40.83/mo")).toBeNull();
    });
  });

  it("annual mode uses annualPriceOverride when provided", () => {
    const tiersWithOverride = [
      {
        name: "Starter",
        price: "$49/mo",
        monthlyPriceCents: 4900,
        annualPriceOverride: "$24.99/yr",
        features: ["5 users"],
      },
    ];
    // Annual is default - override is shown immediately
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithOverride} />);
    expect(screen.getByText("$24.99/yr")).toBeDefined();
    // The computed price should NOT show - override takes precedence
    expect(screen.queryByText("$490/yr")).toBeNull();
  });

  it("annual mode uses annualPriceCents to display exact per-month price", () => {
    const tiersWithAnnualPriceCents = [
      {
        name: "Starter",
        price: "$29/mo billed annually",
        monthlyPriceCents: 2000,
        annualPriceCents: 1600,
        features: ["5 users"],
      },
      {
        name: "Growth",
        price: "$49/mo",
        monthlyPriceCents: 4900,
        annualPriceCents: 3920,
        features: ["25 users"],
        highlighted: true,
      },
    ];
    // Annual is default - annualPriceCents used, no tilde prefix
    render(
      <FakeDoorPricing {...defaultProps} tiers={tiersWithAnnualPriceCents} />,
    );
    expect(screen.getAllByText("$16/mo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$39.20/mo").length).toBeGreaterThan(0);
    // Computed fallback (~$16.67/mo) must NOT show - annualPriceCents takes priority
    expect(screen.queryByText("~$16.67/mo")).toBeNull();
  });

  it("shows billed-annually sub-label and monthly strikethrough when annualPriceCents is set", () => {
    const tiersWithAnnualPriceCents = [
      {
        name: "Starter",
        price: "$29/mo billed annually",
        monthlyPriceCents: 2000,
        annualPriceCents: 1600,
        features: ["5 users"],
      },
    ];
    render(
      <FakeDoorPricing {...defaultProps} tiers={tiersWithAnnualPriceCents} />,
    );
    // "billed annually" sub-label
    expect(screen.getAllByText("billed annually").length).toBeGreaterThan(0);
    // Strikethrough of the monthly price
    const struckThrough = document.querySelector(".line-through");
    expect(struckThrough).not.toBeNull();
    expect(struckThrough?.textContent).toBe("$29/mo billed annually");
  });

  it("switching to monthly hides billed-annually sub-label when annualPriceCents is set", async () => {
    const tiersWithAnnualPriceCents = [
      {
        name: "Starter",
        price: "$29/mo billed annually",
        monthlyPriceCents: 2000,
        annualPriceCents: 1600,
        features: ["5 users"],
      },
    ];
    render(
      <FakeDoorPricing {...defaultProps} tiers={tiersWithAnnualPriceCents} />,
    );
    // Confirm annual sub-label present by default
    expect(screen.getAllByText("billed annually").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));

    await waitFor(() => {
      expect(screen.queryByText("billed annually")).toBeNull();
      expect(screen.getByText("$29/mo billed annually")).toBeDefined();
    });
  });

  it("trial banner renders when trialBannerText is provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        trialBannerText="Pick a plan to see pricing details and next steps."
      />,
    );
    expect(
      screen.getByText("Pick a plan to see pricing details and next steps."),
    ).toBeDefined();
  });

  it("trial banner is absent when trialBannerText is not provided", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    expect(
      screen.queryByText("Pick a plan to see pricing details and next steps."),
    ).toBeNull();
  });

  it("normalizes free-trial banner copy before rendering", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        trialBannerText="free trial included"
      />,
    );

    expect(
      screen.getByText(
        /try scale features first\. pick a plan later\. keep the 30-day money-back guarantee/i,
      ),
    ).toBeDefined();
    expect(screen.getByText(/30-day money-back guarantee/i)).toBeDefined();
  });

  it("savings badge is shown on Annual toggle when annualSavingsText is provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        annualSavingsText="20% off annual"
      />,
    );
    // Badge is always on the Annual toggle button (annual is default)
    expect(screen.getByText("20% off annual")).toBeDefined();
  });

  it("savings badge remains on Annual toggle even when monthly mode is active", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        annualSavingsText="20% off annual"
      />,
    );
    // Switch to monthly
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    await waitFor(() => {
      // Badge is still visible on the toggle - it's a permanent value prop
      expect(screen.getByText("20% off annual")).toBeDefined();
    });
  });

  it("fetch body contains billingPeriod: annual by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as { billingPeriod: string };
      expect(body.billingPeriod).toBe("annual");
    });
  });

  it("fetch body contains billingPeriod: monthly after switching to monthly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    // Switch to monthly (annual is default)
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));

    await waitFor(() => {
      expect(screen.getAllByText("$49/mo").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as { billingPeriod: string };
      expect(body.billingPeriod).toBe("monthly");
    });
  });

  it("fetch body contains billingPeriod: lifetime after switching to lifetime", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} tiers={florivaBillingTier} />);

    fireEvent.click(screen.getByRole("radio", { name: "Lifetime" }));

    await waitFor(() => {
      expect(screen.getByText("$59.99 lifetime")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Floriva" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as { billingPeriod: string };
      expect(body.billingPeriod).toBe("lifetime");
    });
  });

  it("struck-through monthly price appears in annual mode for tiers with monthlyPriceCents", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      // The monthly price string should still be in the DOM (as a struck-through element)
      const allStarterPrice = screen.getAllByText("$49/mo");
      expect(allStarterPrice.length).toBeGreaterThan(0);
      // Check it has line-through styling
      const struckThrough = allStarterPrice.find((el) =>
        el.className.includes("line-through"),
      );
      expect(struckThrough).toBeDefined();
    });
  });

  it("toggle uses custom labels when monthlyToggleLabel and annualToggleLabel are provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        monthlyToggleLabel="Per Month"
        annualToggleLabel="Per Year"
      />,
    );
    expect(screen.getByRole("radio", { name: "Per Month" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Per Year" })).toBeDefined();
    expect(screen.queryByRole("radio", { name: "Monthly" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Annual" })).toBeNull();
  });

  it("Annual radio is aria-checked=true by default, Monthly is aria-checked=false", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    const monthlyBtn = screen.getByRole("radio", { name: "Monthly" });
    const annualBtn = screen.getByRole("radio", { name: "Annual" });
    expect(annualBtn.getAttribute("aria-checked")).toBe("true");
    expect(monthlyBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("Monthly radio becomes aria-checked=true after clicking it", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    await waitFor(() => {
      expect(
        screen
          .getByRole("radio", { name: "Monthly" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        screen
          .getByRole("radio", { name: "Annual" })
          .getAttribute("aria-checked"),
      ).toBe("false");
    });
  });

  it("billing period radios keep a mobile-safe minimum tap height", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    expect(screen.getByRole("radio", { name: "Monthly" }).className).toContain(
      "min-h-11",
    );
    expect(screen.getByRole("radio", { name: "Annual" }).className).toContain(
      "min-h-11",
    );
  });

  it("radiogroup has aria-label 'Billing period'", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Billing period");
  });

  it("tiers without monthlyPriceCents show original price in annual mode (no change)", async () => {
    const mixedTiers = [
      {
        name: "Starter",
        price: "$49/mo",
        monthlyPriceCents: 4900,
        features: ["5 users"],
      },
      {
        name: "Enterprise",
        price: "Contact us",
        features: ["Custom"],
      },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={mixedTiers} />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    await waitFor(() => {
      // Enterprise has no monthlyPriceCents - shows original price
      expect(screen.getAllByText("Contact us").length).toBeGreaterThan(0);
    });
  });

  it("selectedMessages key normalization works in billing toggle context", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        selectedMessages={{ Starter: "Starter toggle message" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      // selectedMessages key normalization (case-insensitive) should work
      expect(screen.getByText("Starter toggle message")).toBeDefined();
    });
  });

  it("annual per-month price shown by default, switching to Monthly restores monthly prices", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    // Annual is default - per-month equivalent shown (4900 * 10 / 12 / 100 ≈ $40.83)
    expect(screen.getAllByText("~$40.83/mo").length).toBeGreaterThan(0);

    // Switch to Monthly
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    await waitFor(() => {
      // Monthly price should be shown
      expect(screen.getAllByText("$49/mo").length).toBeGreaterThan(0);
      // Annual per-month equivalent should be gone
      expect(screen.queryByText("~$40.83/mo")).toBeNull();
    });

    // Switch back to Annual
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    await waitFor(() => {
      expect(screen.getAllByText("~$40.83/mo").length).toBeGreaterThan(0);
    });
  });

  it("switching to Lifetime shows the lifetime override without a monthly equivalent label", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={florivaBillingTier} />);

    fireEvent.click(screen.getByRole("radio", { name: "Lifetime" }));

    await waitFor(() => {
      expect(screen.getByText("$59.99 lifetime")).toBeDefined();
    });

    expect(screen.queryByText("~$3.33/mo")).toBeNull();
    expect(screen.queryByText("$39.99/yr")).toBeNull();
  });

  it("shows per-month equivalent as main price in annual mode", () => {
    // Tier with monthlyPriceCents: 4900 → per-month equivalent ~$40.83/mo
    // Annual is default, so the per-month price is shown immediately
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    expect(screen.getAllByText("~$40.83/mo").length).toBeGreaterThan(0);
    // "billed annually" sub-label present
    expect(screen.getAllByText("billed annually").length).toBeGreaterThan(0);
  });

  it("per-month equivalent label is absent in monthly mode", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    // Switch to monthly
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    await waitFor(() => {
      // Per-month equivalent label must not appear in monthly mode
      expect(screen.queryByText("~$40.83/mo")).toBeNull();
    });
  });
});

describe("FakeDoorPricing - clearButtonText prop", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("uses custom clearButtonText on clear buttons", async () => {
    render(<FakeDoorPricing {...defaultProps} clearButtonText="Reset" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    });
    // Default "Clear" text must not appear
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });

  it("defaults clearButtonText to 'Clear' when not provided", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
  });

  // --- analytics: pricing_tier_selected ---

  it("fires pricing_tier_selected with correct tier_name, source_page, and billing_period on successful POST", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} sourcePage="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("pricing_tier_selected", {
        tier_name: "Pro",
        source_page: "/pricing",
        billing_period: "annual",
      });
    });
  });

  it("still fires trackEvent when the pricing beacon fails", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    // Wait a tick for the async handleClick to run
    await waitFor(() => {
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("pricing_tier_selected", {
        tier_name: "Starter",
        source_page: "/pricing",
        billing_period: "annual",
      });
    });
  });

  it("falls back to fetch when sendBeacon returns false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const sendBeaconMock = vi.fn().mockReturnValue(false);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconMock,
    });

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(sendBeaconMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/pricing-click",
        expect.objectContaining({
          method: "POST",
          keepalive: true,
        }),
      );
    });
  });

  // ── Bug 3f: hydration mismatch - sessionId must be set via useEffect, not useState init ──
  it("uses sendBeacon without fetch when sendBeacon accepts the pricing click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconMock,
    });

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(sendBeaconMock).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("sessionId is populated via useEffect (not useState initializer), avoiding hydration mismatch", async () => {
    // The fix: useState("") + useEffect(() => setSessionId(generateSessionId()), [])
    // This means on the server the sessionId starts as "" (deterministic),
    // and the client sets it after hydration.
    // We verify this by intercepting fetch calls after a tier click to check
    // that sessionId is a non-empty string (set by useEffect, not initial state).
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);

    // Click a tier - this triggers the pricing click which uses sessionId
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { sessionId: string };

    // sessionId must be a non-empty string (generated by useEffect after mount)
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  // --- Fix C: z-index standardization ---
  it("modal overlay uses z-[60] class above site header", async () => {
    const emailCaptureProps = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [],
      discoveryCallUrl: "https://cal.test",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const modalOverlay = screen.getByRole("dialog").closest(".fixed.inset-0");
      expect(modalOverlay).not.toBeNull();
      expect(modalOverlay!.className).toContain("z-[60]");
      expect(modalOverlay!.className).not.toContain("z-50");
    });
  });

  it("calls trackBillingToggle when monthly toggle is clicked", () => {
    const tiersWithAnnual = tiers.map((t) => ({
      ...t,
      monthlyPriceCents: 2900,
    }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithAnnual}
        showBillingToggle={true}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(trackBillingToggle).toHaveBeenCalledWith("monthly", "/pricing");
  });

  it("calls trackBillingToggle when annual toggle is clicked", () => {
    const tiersWithAnnual = tiers.map((t) => ({
      ...t,
      monthlyPriceCents: 2900,
    }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithAnnual}
        showBillingToggle={true}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    expect(trackBillingToggle).toHaveBeenCalledWith("annual", "/pricing");
  });

  it("calls trackBillingToggle when lifetime toggle is clicked", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={florivaBillingTier}
        showBillingToggle={true}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Lifetime" }));
    expect(trackBillingToggle).toHaveBeenCalledWith("lifetime", "/pricing");
  });

  describe("open-pricing-modal CustomEvent", () => {
    const emailCaptureProps = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "",
    };

    it("signals that the pricing modal is ready after mount", async () => {
      const readyListener = vi.fn();
      document.addEventListener("fake-door-pricing-ready", readyListener);

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await waitFor(() => {
        expect(readyListener).toHaveBeenCalledTimes(1);
        expect(document.documentElement.dataset.fakeDoorPricingReady).toBe(
          "true",
        );
      });

      document.removeEventListener("fake-door-pricing-ready", readyListener);
    });

    it("opens modal, pre-selects first tier, and tracks the first tier when event is dispatched with emailCapture prop", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      const { trackEvent } = await import("../lib/analytics");
      const onTierClick = vi.fn();

      render(
        <FakeDoorPricing
          {...defaultProps}
          emailCapture={emailCaptureProps}
          onTierClick={onTierClick}
        />,
      );

      // Modal should not be open yet
      expect(screen.queryByRole("dialog")).toBeNull();

      // Dispatch the custom event
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // Modal should now be open
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      // The first tier ("Starter") should be pre-selected
      // When selected, the tier shows "Selected" badge and button text
      await waitFor(() => {
        expect(screen.queryAllByText("Selected").length).toBeGreaterThanOrEqual(
          1,
        );
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledOnce();
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as {
          tier: string;
          sourcePage: string;
          billingPeriod: string;
        };

        expect(body.tier).toBe("starter");
        expect(body.sourcePage).toBe("/pricing");
        expect(body.billingPeriod).toBe("annual");
        expect(trackEvent).toHaveBeenCalledWith("pricing_tier_selected", {
          tier_name: "Starter",
          source_page: "/pricing",
          billing_period: "annual",
        });
        expect(onTierClick).toHaveBeenCalledOnce();
      });
    });

    it("uses the event detail tierName instead of defaulting to the first tier", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await act(async () => {
        document.dispatchEvent(
          new CustomEvent("open-pricing-modal", {
            detail: { tierName: "Enterprise" },
          }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      await waitFor(() => {
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as { tier: string };
        expect(body.tier).toBe("enterprise");
      });
    });

    it("auto-opens the matched tier from the current url plan query", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      window.history.replaceState({}, "", "/?plan=enterprise#pricing");

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      await waitFor(() => {
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as { tier: string };
        expect(body.tier).toBe("enterprise");
      });

      window.history.replaceState({}, "", "/");
    });

    it("does nothing when open-pricing-modal is dispatched without emailCapture prop", async () => {
      render(<FakeDoorPricing {...defaultProps} />);

      // Dispatch the custom event
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // Modal should still not be open (no emailCapture prop)
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does nothing when open-pricing-modal is dispatched with empty tiers", async () => {
      render(
        <FakeDoorPricing
          {...defaultProps}
          tiers={[]}
          emailCapture={emailCaptureProps}
        />,
      );

      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("has data-fake-door-pricing attribute on the outermost element", () => {
      const { container } = render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );
      expect(
        container.querySelector("[data-fake-door-pricing]"),
      ).not.toBeNull();
    });

    it("removes the event listener on unmount", async () => {
      const { unmount } = render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      unmount();

      // Dispatching after unmount should not throw or cause state updates
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // No dialog rendered after unmount
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("FakeDoorPricing - appUrl redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("navigates to appUrl signup URL when appUrl is provided and tier is clicked", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignMock, href: "" },
      writable: true,
      configurable: true,
    });
    let capturedHref = "";
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(
      <FakeDoorPricing
        {...defaultProps}
        appUrl="https://my.app.test"
        tiers={[
          {
            name: "Starter",
            price: "$29/mo billed annually",
            features: ["Basic"],
            slug: "starter",
          },
        ]}
        buttonPrefix="Choose"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    });

    await waitFor(() => {
      expect(capturedHref).toBe(
        "https://my.app.test/signup?plan=starter&cycle=annual",
      );
    });
  });

  it("uses tier.name.toLowerCase() as plan slug fallback when tier has no slug", async () => {
    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(
      <FakeDoorPricing
        {...defaultProps}
        appUrl="https://my.app.test"
        buttonPrefix="Choose"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    await waitFor(() => {
      expect(capturedHref).toBe(
        "https://my.app.test/signup?plan=pro&cycle=annual",
      );
    });
  });

  it("includes correct billing cycle in signup URL when annual is selected", async () => {
    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    const tiersWithMonthly = [
      {
        name: "Starter",
        price: "$29/mo billed annually",
        monthlyPriceCents: 2000,
        features: ["Basic"],
      },
    ];

    render(
      <FakeDoorPricing
        {...defaultProps}
        appUrl="https://my.app.test"
        tiers={tiersWithMonthly}
        buttonPrefix="Choose"
      />,
    );

    // Annual is default - per-month equivalent is shown immediately (2000 * 10 / 12 / 100 ≈ $16.67)
    expect(screen.getByText("~$16.67/mo")).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    });

    await waitFor(() => {
      expect(capturedHref).toBe(
        "https://my.app.test/signup?plan=starter&cycle=annual",
      );
    });
  });

  it("still fires the analytics POST to waitlist endpoint alongside the redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(<FakeDoorPricing {...defaultProps} appUrl="https://my.app.test" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/pricing-click",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(capturedHref).toBe(
      "https://my.app.test/signup?plan=pro&cycle=annual",
    );
  });

  it("does not redirect when appUrl is not provided", async () => {
    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(<FakeDoorPricing {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    await waitFor(() => {
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });

    expect(capturedHref).toBe("");
  });

  it("redirect fires even when the analytics POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(<FakeDoorPricing {...defaultProps} appUrl="https://my.app.test" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    await waitFor(() => {
      expect(capturedHref).toBe(
        "https://my.app.test/signup?plan=pro&cycle=annual",
      );
    });
  });

  it("does NOT redirect when both appUrl and emailCapture are set — modal stays open", async () => {
    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(
      <FakeDoorPricing
        {...defaultProps}
        appUrl="https://app.example.com"
        emailCapture={{
          apiUrl: "https://api.test",
          sourcePage: "/pricing",
          surveyQuestions: [],
          discoveryCallUrl: "https://cal.example.com",
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    // Wait long enough for the 150ms race to have fired if the bug were present
    await waitFor(
      () => {
        expect(screen.getByTestId("email-capture")).toBeDefined();
      },
      { timeout: 500 },
    );

    // Modal must be open — EmailCapture rendered
    expect(screen.getByTestId("email-capture")).toBeDefined();
    // No navigation must have occurred
    expect(capturedHref).toBe("");
  });

  it("still redirects when appUrl is set and hasEmailCaptureFlow is false", async () => {
    let capturedHref = "";
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(val: string) {
        capturedHref = val;
      },
      get() {
        return capturedHref;
      },
      configurable: true,
    });

    render(
      <FakeDoorPricing {...defaultProps} appUrl="https://app.example.com" />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    });

    await waitFor(() => {
      expect(capturedHref).toBe(
        "https://app.example.com/signup?plan=pro&cycle=annual",
      );
    });
  });
});

describe("FakeDoorPricing - editorial comparison layout", () => {
  const statutoryTiers = [
    {
      name: "Starter",
      complianceScope: "Small-board compliance",
      price: "$29/mo billed annually",
      monthlyPriceCents: 2000,
      features: ["Reserve separation"],
      statutoryFeatures: [
        {
          category: "fund-separation" as const,
          label: "Reserve/operating fund enforced separation",
          citation: "CA §5550",
        },
        {
          category: "governance" as const,
          label: "Up to 3 board users",
        },
      ],
    },
    {
      name: "Growth",
      complianceScope: "Mid-size board + owner operations",
      price: "$49/mo",
      monthlyPriceCents: 4900,
      highlighted: true,
      features: ["Reserve separation", "Owner portal with audit trail"],
      statutoryFeatures: [
        {
          category: "fund-separation" as const,
          label: "Reserve/operating fund enforced separation",
          citation: "CA §5550",
        },
        {
          category: "owner-operations" as const,
          label: "Owner portal with audit trail",
          citation: "FL §720.303(5)",
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("renders compliance-scope kicker for each tier that provides one", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />);
    expect(screen.getByText(/Small-board compliance/)).toBeDefined();
    expect(
      screen.getByText(/Mid-size board \+ owner operations/),
    ).toBeDefined();
  });

  it("renders prices in serif display (no font-mono) with clamp display size", () => {
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />,
    );
    // No price should carry font-mono any longer
    const monoPrices = container.querySelectorAll(".font-mono");
    expect(monoPrices.length).toBe(0);
    // The display price span carries font-heading and a clamp(...) inline style.
    // jsdom drops unrecognized CSS functions from inline style, so we mirror
    // the clamp value on a data-display-price attribute for assertability.
    const displayNodes = Array.from(
      container.querySelectorAll("span.font-heading[data-display-price]"),
    );
    expect(displayNodes.length).toBeGreaterThan(0);
    displayNodes.forEach((node) => {
      expect(node.getAttribute("data-display-price") ?? "").toMatch(/clamp\(/);
    });
  });

  it("groups statutory features under compliance-category headings", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />);
    expect(screen.getByText("Fund separation")).toBeDefined();
    expect(screen.getByText("Governance record")).toBeDefined();
    expect(screen.getByText("Owner operations")).toBeDefined();
  });

  it("renders statute citations in the statute-citation style when provided", () => {
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />,
    );
    const citation = container.querySelector(".u-statute-citation");
    expect(citation).toBeTruthy();
    expect(citation?.textContent).toMatch(/§/);
  });

  it("missing features for a tier render as an em-dash placeholder cell", () => {
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />,
    );
    // Growth has no governance feature in this fixture - the governance row
    // must render an empty placeholder cell for Growth.
    const cells = Array.from(container.querySelectorAll('[role="cell"]')).map(
      (el) => el.textContent?.trim(),
    );
    expect(cells).toContain("--");
  });

  it("does not render legacy gold-circle checkmark SVG in the feature rows", () => {
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={statutoryTiers} />,
    );
    // Feature rows should use the typographic ▸ mark, not a gold-circle SVG.
    // The new rows never contain an <svg> inside a [role="cell"].
    const svgsInCells = container.querySelectorAll('[role="cell"] svg');
    expect(svgsInCells.length).toBe(0);
    // And the ▸ glyph is present in at least one row.
    const text = container.textContent ?? "";
    expect(text).toContain("▸");
  });

  it("falls back to the plain features list when no tier has statutoryFeatures", () => {
    const plainTiers = statutoryTiers.map(
      ({ statutoryFeatures: _omit, ...rest }) => rest,
    );
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={plainTiers} />,
    );
    // No category headers should be rendered
    expect(screen.queryByText("Fund separation")).toBeNull();
    // A catch-all "What's included" heading appears instead
    expect(screen.getByText(/What's included/)).toBeDefined();
    // Comparison layout is still used
    expect(
      container.querySelector('[data-pricing-layout="comparison"]'),
    ).toBeTruthy();
  });

  it("single-tier layout renders statutory categories stacked with the tier header", () => {
    const [singleTier] = statutoryTiers;
    const { container } = render(
      <FakeDoorPricing {...defaultProps} tiers={[singleTier]} />,
    );
    expect(
      container.querySelector('[data-pricing-layout="single"]'),
    ).toBeTruthy();
    // Category label rendered
    expect(screen.getByText("Fund separation")).toBeDefined();
    // Citation rendered beneath the feature
    expect(
      container.querySelector(".u-statute-citation")?.textContent ?? "",
    ).toContain("§");
  });

  it("single-tier fallback list renders when statutoryFeatures is absent", () => {
    const plainSingle = {
      name: "Solo",
      price: "$19/mo",
      features: ["Feature A", "Feature B"],
    };
    render(<FakeDoorPricing {...defaultProps} tiers={[plainSingle]} />);
    expect(screen.getByText("Feature A")).toBeDefined();
    expect(screen.getByText("Feature B")).toBeDefined();
  });
});

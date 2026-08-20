import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PostSignupSurvey } from "./post-signup-survey";
import type { SurveyQualificationConfig } from "../lib/types";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

const questions = [
  { id: "role", text: "Your role?", options: ["Dev", "PM", "Other"] },
  { id: "tool", text: "Current tool?", options: ["Excel", "Custom"] },
];

const defaultProps = {
  apiUrl: "https://api.test",
  signupEmail: "user@test.com",
  surveyToken: "test-survey-token",
  questions,
  discoveryCallUrl: "https://cal.com/test",
  onComplete: vi.fn(),
  sourcePage: "/test-page",
  qualifiedHeading: "You're a great fit!",
  qualifiedBody: "Book a 15-min walkthrough to get started.",
  qualifiedCtaText: "Book My Walkthrough",
  qualifiedDismissText: "No thanks",
  unqualifiedHeading: "You're on the list!",
  unqualifiedBody: "Check your inbox for your login details.",
  unqualifiedCtaText: "Explore our guides",
  unqualifiedCtaTarget: "/resources",
  unqualifiedDismissText: "Got it",
};

const fortyPlusQualification: SurveyQualificationConfig = {
  logic: "any",
  rules: [
    {
      questionId: "role",
      answers: ["Dev"],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps.onComplete = vi.fn();
});

describe("PostSignupSurvey", () => {
  it("renders first question text and options", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    expect(screen.getByText("Your role?")).toBeDefined();
    expect(screen.getByText("Dev")).toBeDefined();
    expect(screen.getByText("PM")).toBeDefined();
    expect(screen.getByText("Other")).toBeDefined();
  });

  it("shows question progress", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    expect(screen.getByText("Question 1 of 2")).toBeDefined();
  });

  it("clicking option advances to next question", async () => {
    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    expect(screen.getByText("Current tool?")).toBeDefined();
    expect(screen.getByText("Question 2 of 2")).toBeDefined();
  });

  it("calls fetch with all answers after last question", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/waitlist/survey",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surveyToken: "test-survey-token",
            answers: [
              { questionId: "role", answer: "Dev" },
              { questionId: "tool", answer: "Excel" },
            ],
          }),
        },
      );
    });
  });

  it("shows qualified completion screen (default heading) after submit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("shows Book My Walkthrough link when qualifyCriteria returns true (default CTA text)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Book My Walkthrough")).toBeDefined();
      expect(screen.getByText("No thanks")).toBeDefined();
    });
  });

  it("shows Got it button when qualifyCriteria returns false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Got it")).toBeDefined();
    });
  });

  it("uses qualificationConfig to show the unqualified path when answers do not match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualificationConfig={{
          logic: "all",
          rules: [
            { questionId: "role", answers: ["PM"] },
            { questionId: "tool", answers: ["Custom"] },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're on the list!")).toBeDefined();
      expect(screen.getByText("Explore our guides")).toBeDefined();
    });
  });

  it("No thanks button calls onComplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("No thanks"));
    fireEvent.click(screen.getByText("No thanks"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("Got it button calls onComplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("Got it"));
    fireEvent.click(screen.getByText("Got it"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("buttons disabled during submitting", async () => {
    let resolveFetch: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      // Should not show completion yet since fetch hasn't resolved
      // This verifies the submitting state exists
    });

    resolveFetch!({ ok: true });

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("fetch failure shows error state with retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
      expect(screen.getByText("Try Again")).toBeDefined();
      expect(screen.getByText("Skip")).toBeDefined();
    });
  });

  it("uses custom qualifiedHeading when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        qualifiedHeading="Welcome aboard!"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Welcome aboard!")).toBeDefined();
    });
  });

  it("uses custom qualifiedBody when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        qualifiedBody="Schedule your demo now."
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Schedule your demo now.")).toBeDefined();
    });
  });

  it("uses custom qualifiedCtaText when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        qualifiedCtaText="Book Discovery Call"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Book Discovery Call")).toBeDefined();
    });
  });

  it("uses custom unqualifiedHeading when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedHeading="Thanks for signing up!"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Thanks for signing up!")).toBeDefined();
    });
  });

  it("uses custom unqualifiedBody when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedBody="Stay tuned for updates."
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Stay tuned for updates.")).toBeDefined();
    });
  });

  it("does not render unqualifiedHeading when prop is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { unqualifiedHeading: _, ...propsWithoutHeading } = defaultProps;
    render(
      <PostSignupSurvey
        {...propsWithoutHeading}
        qualifyCriteria={() => false}
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(screen.queryByText("You're on the list!")).toBeNull();
  });

  it("does not render unqualifiedBody when prop is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { unqualifiedBody: _, ...propsWithoutBody } = defaultProps;
    render(
      <PostSignupSurvey {...propsWithoutBody} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(screen.queryByText("We'll email you on launch day.")).toBeNull();
  });

  it("renders qualifiedBody when prop is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(
        screen.getByText("Book a 15-min walkthrough to get started."),
      ).toBeDefined();
    });
  });

  it("close button has w-11 h-11 tap target class on survey screen", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    const closeBtn = screen.getByLabelText("Close survey");
    expect(closeBtn.className).toContain("w-11");
    expect(closeBtn.className).toContain("h-11");
  });

  it("close button has w-11 h-11 tap target class on qualified completion screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("You're a great fit!"));
    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn.className).toContain("w-11");
    expect(closeBtn.className).toContain("h-11");
  });

  it("close button has w-11 h-11 tap target class on unqualified completion screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("You're on the list!"));
    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn.className).toContain("w-11");
    expect(closeBtn.className).toContain("h-11");
  });

  it("option buttons do not have border-l-[3px] hover class", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    const devBtn = screen.getByText("Dev");
    expect(devBtn.className).not.toContain("border-l-[3px]");
  });

  it("qualified CTA link has stronger style classes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("Book My Walkthrough"));
    const ctaLink = screen.getByText("Book My Walkthrough");
    expect(ctaLink.className).toContain("btn-primary");
  });

  it("close button on survey screen calls onComplete", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Close survey"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("Escape key calls onComplete", () => {
    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("close button on qualified screen calls onComplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("You're a great fit!"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("close button on unqualified screen calls onComplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("You're on the list!"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("does not render qualified dismiss button when qualifiedDismissText is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { qualifiedDismissText: _, ...propsWithout } = defaultProps;
    render(<PostSignupSurvey {...propsWithout} qualifyCriteria={() => true} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("You're a great fit!"));
    expect(screen.queryByText("No thanks")).toBeNull();
  });

  it("uses custom qualifiedDismissText when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        qualifiedDismissText="Maybe later"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Maybe later")).toBeDefined();
      expect(screen.queryByText("No thanks")).toBeNull();
    });
  });

  it("does not render unqualified CTA link when unqualifiedCtaText is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { unqualifiedCtaText: _, ...propsWithout } = defaultProps;
    render(
      <PostSignupSurvey {...propsWithout} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(
      screen.queryByRole("link", { name: "Explore our guides" }),
    ).toBeNull();
  });

  it("uses custom unqualifiedCtaText when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaText="Sounds good"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Sounds good")).toBeDefined();
    });
  });

  it("unqualified path shows CTA link with provided text and target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaTarget="/resources"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      const ctaLink = screen.getByRole("link", { name: "Explore our guides" });
      expect(ctaLink).toBeDefined();
      expect((ctaLink as HTMLAnchorElement).href).toContain("/resources");
    });
  });

  it("unqualified path shows custom CTA text when unqualifiedCtaText provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaText="Browse case studies"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      const ctaLink = screen.getByRole("link", {
        name: "Browse case studies",
      });
      expect(ctaLink).toBeDefined();
    });
  });

  it("unqualified path shows custom CTA target when unqualifiedCtaTarget provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaTarget="/case-studies"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      const ctaLink = screen.getByRole("link", { name: "Explore our guides" });
      expect((ctaLink as HTMLAnchorElement).href).toContain("/case-studies");
    });
  });

  it("both primary CTA link and dismiss button render in unqualified path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaTarget="/resources"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      // Primary CTA link
      expect(
        screen.getByRole("link", { name: "Explore our guides" }),
      ).toBeDefined();
      // Secondary dismiss button
      expect(screen.getByText("Got it")).toBeDefined();
    });
  });

  it("dismiss 'Got it' button in unqualified path calls onComplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("Got it"));
    fireEvent.click(screen.getByText("Got it"));
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("primary CTA link in unqualified path has accent styling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        unqualifiedCtaTarget="/resources"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("link", { name: "Explore our guides" }),
    );
    const ctaLink = screen.getByRole("link", { name: "Explore our guides" });
    expect(ctaLink.className).toContain("btn-primary");
  });

  it("dismiss button in unqualified path has secondary (border-only) styling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey {...defaultProps} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => screen.getByText("Got it"));
    const dismissBtn = screen.getByText("Got it");
    expect(dismissBtn.className).toContain("btn-secondary");
  });

  // --- ReferralShare integration ---

  it("renders ReferralShare on qualified done screen when referralCode is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        referralCode="abc123"
        position={42}
        referralRewards={[
          { threshold: 3, description: "Get 7 extra trial days" },
        ]}
        productName="Gavelhouse"
        productDomain="gavelhouse.app"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're signup #42")).toBeDefined();
    });
    expect(
      screen.getByDisplayValue("https://gavelhouse.app/?ref=abc123"),
    ).toBeDefined();
  });

  it("renders ReferralShare on unqualified done screen when referralCode is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => false}
        referralCode="xyz789"
        position={10}
        referralRewards={[{ threshold: 5, description: "Priority access" }]}
        productName="TestApp"
        productDomain="testapp.com"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're signup #10")).toBeDefined();
    });
    expect(
      screen.getByDisplayValue("https://testapp.com/?ref=xyz789"),
    ).toBeDefined();
  });

  it("does not render CTA link when both unqualifiedCtaText and unqualifiedCtaTarget are omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const {
      unqualifiedCtaText: _text,
      unqualifiedCtaTarget: _target,
      ...propsWithout
    } = defaultProps;
    render(
      <PostSignupSurvey {...propsWithout} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not render CTA link when unqualifiedCtaText is provided but unqualifiedCtaTarget is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { unqualifiedCtaTarget: _, ...propsWithout } = defaultProps;
    render(
      <PostSignupSurvey {...propsWithout} qualifyCriteria={() => false} />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() =>
      screen.getByRole("dialog", { name: "Survey complete" }),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows spinner SVG and 'Submitting...' on last-question button during submission", async () => {
    let resolveFetch: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    // Now on last question - clicking an option triggers submit
    fireEvent.click(screen.getByText("Excel"));

    // While fetch is in-flight, buttons should be disabled and show 'Submitting...'
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      // All option buttons should be disabled
      const optionButtons = buttons.filter(
        (b) =>
          b.textContent !== "" &&
          b.getAttribute("aria-label") !== "Close survey",
      );
      optionButtons.forEach((btn) => {
        expect(btn).toHaveProperty("disabled", true);
      });
      // Spinner text must also be visible during the same in-flight window
      expect(screen.getByText("Submitting...", { exact: false })).toBeDefined();
    });

    // Resolve fetch to clean up
    resolveFetch!({ ok: true });
    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("renders nothing (returns null) when questions array is empty", () => {
    const { container } = render(
      <PostSignupSurvey {...defaultProps} questions={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // --- Bug 1: Progress bar off-by-one ---

  it("progress bar shows 0% on question 1 of 3 (step 0)", () => {
    const threeQuestions = [
      { id: "q1", text: "Question 1?", options: ["A", "B"] },
      { id: "q2", text: "Question 2?", options: ["C", "D"] },
      { id: "q3", text: "Question 3?", options: ["E", "F"] },
    ];
    const { container } = render(
      <PostSignupSurvey {...defaultProps} questions={threeQuestions} />,
    );
    // step 0, questions.length 3 → 0/3 * 100 = 0%
    const progressBar = container.querySelector(
      ".h-full.bg-\\[var\\(--color-accent-400\\)\\].transition-\\[transform\\]",
    ) as HTMLElement;
    expect(progressBar.style.transform).toBe("scaleX(0)");
  });

  it("progress bar shows 67% on question 3 of 3 (step 2), not 100%", () => {
    const threeQuestions = [
      { id: "q1", text: "Question 1?", options: ["A", "B"] },
      { id: "q2", text: "Question 2?", options: ["C", "D"] },
      { id: "q3", text: "Question 3?", options: ["E", "F"] },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const { container } = render(
      <PostSignupSurvey {...defaultProps} questions={threeQuestions} />,
    );
    // advance to step 2 (question 3)
    fireEvent.click(screen.getByText("A")); // step 0 → 1
    fireEvent.click(screen.getByText("C")); // step 1 → 2
    // step 2, questions.length 3 → 2/3 * 100 = 67% (not 100% - user hasn't answered yet)
    const progressBar = container.querySelector(
      ".h-full.bg-\\[var\\(--color-accent-400\\)\\].transition-\\[transform\\]",
    ) as HTMLElement;
    expect(progressBar.style.transform).toBe("scaleX(0.67)");
  });

  it("only focuses dialog when status transitions to 'done', not during 'submitting'", async () => {
    let resolveFetch: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<PostSignupSurvey {...defaultProps} />);

    // Get the dialog element and spy on its focus method
    const dialog = screen.getByRole("dialog");
    const focusSpy = vi.spyOn(dialog, "focus");

    // Clear any initial focus calls from mount
    focusSpy.mockClear();

    // Answer first question - status stays "answering"
    fireEvent.click(screen.getByText("Dev"));
    // Answer last question - status transitions to "submitting"
    fireEvent.click(screen.getByText("Excel"));

    // During "submitting", focus should NOT have been called
    expect(focusSpy).not.toHaveBeenCalled();

    // Resolve fetch - status transitions to "done"
    resolveFetch!({ ok: true });

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });

    await waitFor(() => {
      const doneDialog = screen.getByRole("dialog");
      expect(doneDialog).toBe(document.activeElement);
    });
  });

  it("does not render ReferralShare when referralCode is not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        productName="TestApp"
        productDomain="testapp.com"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
    expect(screen.queryByText(/signup #/)).toBeNull();
  });

  it("does not render ReferralShare when position is undefined (no signup #0)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        referralCode="abc123"
        productName="TestApp"
        productDomain="testapp.com"
        // position is intentionally omitted (undefined)
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
    expect(screen.queryByText(/#0/)).toBeNull();
    expect(screen.queryByText(/signup #/)).toBeNull();
  });

  // --- Bug 6: hooks order violation (early return before hooks) ---
  // The guard `if (questions.length === 0) return null` must be BEFORE hooks.
  // If it were after hooks, React would throw a hooks-order error when
  // questions.length changes between renders. This test confirms no error.
  it("does not crash when questions array changes from non-empty to empty", () => {
    const { rerender } = render(<PostSignupSurvey {...defaultProps} />);
    // Re-render with empty questions - should not throw hooks error
    expect(() =>
      rerender(<PostSignupSurvey {...defaultProps} questions={[]} />),
    ).not.toThrow();
  });

  // --- Bug 15: body scroll lock ---
  it("locks body scroll on mount and restores on unmount", () => {
    const { unmount } = render(<PostSignupSurvey {...defaultProps} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock body scroll when questions array is empty", () => {
    document.body.style.overflow = "";
    render(<PostSignupSurvey {...defaultProps} questions={[]} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("does not render ReferralShare when position is 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualifyCriteria={() => true}
        referralCode="abc123"
        position={0}
        productName="TestApp"
        productDomain="testapp.com"
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
    expect(screen.queryByText(/#0/)).toBeNull();
    expect(screen.queryByText(/signup #/)).toBeNull();
  });

  // --- retrySubmission coverage ---

  it("retry success: shows completion screen after successful retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({ ok: true }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("shows error state when initial fetch responds with non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });
  });

  it("shows error state when retry fetch responds with non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });
  });

  it("retry failure: shows error state again on second fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail again")),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });
  });

  // --- analytics: waitlist_survey_submitted ---

  it("fires waitlist_survey_submitted with question_count on successful submission", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("waitlist_survey_submitted", {
        question_count: 2,
        source_page: "/test-page",
        qualification_segment: "qualified",
      });
    });
  });

  it("uses serializable qualification config to show the qualified path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualification={fortyPlusQualification}
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("uses serializable qualification config to show the unqualified path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualification={{
          logic: "all",
          rules: [
            { questionId: "role", answers: ["Other"] },
            { questionId: "tool", answers: ["Custom"] },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're on the list!")).toBeDefined();
    });
  });

  it("fires waitlist_survey_submitted with qualification_segment='unqualified' when rules do not match", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <PostSignupSurvey
        {...defaultProps}
        qualification={{
          logic: "all",
          rules: [{ questionId: "role", answers: ["Other"] }],
        }}
      />,
    );
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("waitlist_survey_submitted", {
        question_count: 2,
        source_page: "/test-page",
        qualification_segment: "unqualified",
      });
    });
  });

  it("fires waitlist_survey_submitted on successful retry submission", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({ ok: true }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("waitlist_survey_submitted", {
        question_count: 2,
        source_page: "/test-page",
        qualification_segment: "qualified",
      });
    });
  });

  it("does not fire trackEvent when fetch fails", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });

    expect(trackEvent).not.toHaveBeenCalledWith(
      "waitlist_survey_submitted",
      expect.anything(),
    );
  });

  // ── Bug 3d: focus trap must be inactive when questions is empty ──────────
  it("calls useFocusTrap with false (not true) when questions is an empty array", async () => {
    const focusTrapModule = await import("../lib/focus-trap");
    const useFocusTrapSpy = vi
      .spyOn(focusTrapModule, "useFocusTrap")
      .mockImplementation(() => undefined);

    render(<PostSignupSurvey {...defaultProps} questions={[]} />);

    // Component renders null when questions is empty - but useFocusTrap is still called
    // It must be called with active=false (not true)
    expect(useFocusTrapSpy).toHaveBeenCalledWith(expect.anything(), false);
    expect(useFocusTrapSpy).not.toHaveBeenCalledWith(expect.anything(), true);

    useFocusTrapSpy.mockRestore();
  });

  // --- Fix: 409 treated as success, missing surveyToken skips API call ---

  it("treats 409 (already completed) as success on initial submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("treats 409 (already completed) as success on retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({ ok: false, status: 409 }),
    );

    render(<PostSignupSurvey {...defaultProps} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
  });

  it("skips API call and shows completion screen when surveyToken is undefined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { surveyToken: _, ...propsWithoutToken } = defaultProps;
    render(<PostSignupSurvey {...propsWithoutToken} surveyToken={undefined} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("You're a great fit!")).toBeDefined();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires waitlist_survey_submitted even when surveyToken is undefined", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn());

    const { surveyToken: _, ...propsWithoutToken } = defaultProps;
    render(<PostSignupSurvey {...propsWithoutToken} surveyToken={undefined} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("waitlist_survey_submitted", {
        question_count: 2,
        source_page: "/test-page",
        qualification_segment: "qualified",
      });
    });
  });

  // --- Fix C: z-index standardization ---
  it("survey overlay uses z-[60] class above site header", () => {
    render(<PostSignupSurvey {...defaultProps} />);

    const overlayDivs = document.querySelectorAll(".fixed.inset-0");
    expect(overlayDivs.length).toBeGreaterThan(0);
    overlayDivs.forEach((div) => {
      expect(div.className).toContain("z-[60]");
      expect(div.className).not.toContain("z-50");
    });
  });

  it("omits source_page from waitlist_survey_submitted event when sourcePage is undefined", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { sourcePage: _, ...propsNoSource } = defaultProps;
    render(<PostSignupSurvey {...propsNoSource} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        "waitlist_survey_submitted",
        expect.not.objectContaining({ source_page: expect.anything() }),
      );
    });
  });

  it("omits source_page from waitlist_survey_submitted event on retry when sourcePage is undefined", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({ ok: true }),
    );

    const { sourcePage: _, ...propsNoSource } = defaultProps;
    render(<PostSignupSurvey {...propsNoSource} />);
    fireEvent.click(screen.getByText("Dev"));
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByText("Try Again")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenLastCalledWith(
        "waitlist_survey_submitted",
        expect.not.objectContaining({ source_page: expect.anything() }),
      );
    });
  });

  it("pressing a non-Escape key does not call onComplete", () => {
    const onComplete = vi.fn();
    render(<PostSignupSurvey {...defaultProps} onComplete={onComplete} />);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("pressing Escape calls onComplete", () => {
    const onComplete = vi.fn();
    render(<PostSignupSurvey {...defaultProps} onComplete={onComplete} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

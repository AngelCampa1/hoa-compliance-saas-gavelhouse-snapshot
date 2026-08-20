import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReferralShare } from "./referral-share";
import type { ReferralReward } from "../lib/types";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

const defaultProps = {
  referralUrl: "https://example.com/ref/abc123",
  position: 42,
  productName: "TestProduct",
  rewards: [] as ReferralReward[],
};

const rewards: ReferralReward[] = [
  { threshold: 3, description: "7 extra days on your free trial" },
  { threshold: 10, description: "Free month" },
];

describe("ReferralShare", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders signup position", () => {
    render(<ReferralShare {...defaultProps} />);
    expect(screen.getByText("You're signup #42")).toBeDefined();
  });

  it("renders the referral URL in the input", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByDisplayValue("https://example.com/ref/abc123");
    expect(input).toBeDefined();
  });

  it("renders Share on X link with correct href", () => {
    render(<ReferralShare {...defaultProps} />);
    const link = screen
      .getByText("Share on X")
      .closest("a") as HTMLAnchorElement;
    expect(link.href).toContain("twitter.com/intent/tweet");
    expect(link.href).toContain(encodeURIComponent("TestProduct"));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders Share on LinkedIn link with correct href", () => {
    render(<ReferralShare {...defaultProps} />);
    const link = screen
      .getByText("Share on LinkedIn")
      .closest("a") as HTMLAnchorElement;
    expect(link.href).toContain("linkedin.com/sharing");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("copies URL to clipboard on Copy button click", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/ref/abc123",
    );
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();
  });

  it("resets Copied! back to Copy after 2 seconds", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  it("selects the input and shows manual-copy guidance when clipboard fails", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    const input = screen.getByLabelText("Referral URL") as HTMLInputElement;
    const focusSpy = vi.spyOn(input, "focus");
    const selectSpy = vi.spyOn(input, "select");

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
    expect(
      screen.getByText(/clipboard access is unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders no rewards section when rewards array is empty", () => {
    render(<ReferralShare {...defaultProps} rewards={[]} />);
    expect(screen.queryByText("Referral rewards:")).toBeNull();
  });

  it("renders reward items when rewards are provided", () => {
    render(<ReferralShare {...defaultProps} rewards={rewards} />);
    expect(screen.getByText("Referral rewards:")).toBeDefined();
    expect(screen.getByText("7 extra days on your free trial")).toBeDefined();
    expect(screen.getByText("Free month")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined();
  });

  it("renders share subtitle text", () => {
    render(<ReferralShare {...defaultProps} />);
    expect(screen.getByText("Share to get access sooner")).toBeDefined();
  });

  it("input is read-only", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByDisplayValue(
      "https://example.com/ref/abc123",
    ) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("referral URL input has aria-label for screen readers", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByLabelText("Referral URL") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("https://example.com/ref/abc123");
  });

  it("clears existing timer when Copy is clicked a second time", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  it("does not warn about state update on unmounted component after copy and early unmount", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { unmount } = render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const stateUpdateWarnings = consoleSpy.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        (args[0] as string).includes("state update on an unmounted component"),
    );
    expect(stateUpdateWarnings.length).toBe(0);

    consoleSpy.mockRestore();
  });

  it("fires referral_link_copied when user copies their referral link", async () => {
    const { trackEvent } = await import("../lib/analytics");
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(trackEvent).toHaveBeenCalledWith("referral_link_copied");
  });
});

describe("referral-share pill canon (F)", () => {
  const srcPath = path.resolve(__dirname, "referral-share.tsx");

  it("copied-state button className uses rounded-full (pill canon)", () => {
    const src = fs.readFileSync(srcPath, "utf8");
    // The copied branch className must include rounded-full
    expect(src).toContain("rounded-full");
  });

  it("copied-state button className does NOT use rounded-[var(--radius-md)]", () => {
    const src = fs.readFileSync(srcPath, "utf8");
    // The non-pill radius must be gone from the button copied branch
    // Note: the readonly <input> above the button also uses rounded-[var(--radius-md)]
    // so we target the copied-state className string specifically.
    const copiedBranch = src.match(/copied\s*\?(.*?):/s)?.[1] ?? "";
    expect(copiedBranch).not.toContain("rounded-[var(--radius-md)]");
  });
});

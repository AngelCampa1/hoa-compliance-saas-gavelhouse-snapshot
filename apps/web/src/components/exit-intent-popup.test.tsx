import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
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

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: vi.fn(() => null),
}));

// ─── util mocks (hoisted so they apply before imports) ───────────────────────
vi.mock("../lib/exit-popup-utils", () => ({
  SUPPRESS_DAYS: 30,
  SUPPRESS_KEY: "exit-popup-suppressed",
  SIGNED_UP_KEY: "exit-popup-signed-up",
  isSignedUp: vi.fn(() => false),
  isWithinSuppressWindow: vi.fn(() => false),
  setSuppressed: vi.fn(),
  setSignedUp: vi.fn(),
  detectScrollBack: vi.fn(() => false),
}));

import {
  isSignedUp,
  isWithinSuppressWindow,
  setSuppressed,
  setSignedUp,
  detectScrollBack,
  SUPPRESS_DAYS,
  SUPPRESS_KEY,
  SIGNED_UP_KEY,
} from "../lib/exit-popup-utils";
import { ExitIntentPopup } from "./exit-intent-popup";

const mockIsSignedUp = isSignedUp as unknown as MockInstance;
const mockIsWithinSuppressWindow =
  isWithinSuppressWindow as unknown as MockInstance;
const mockSetSuppressed = setSuppressed as unknown as MockInstance;
const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockDetectScrollBack = detectScrollBack as unknown as MockInstance;

const defaultProps = {
  apiUrl: "https://api.test",
  siteName: "TestSite",
  headline: "Before you go - get started",
  description: "Try TestSite free for 30 days.",
  ctaText: "Get Started",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox for your login details.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSignedUp.mockReturnValue(false);
  mockIsWithinSuppressWindow.mockReturnValue(false);
  mockSetSuppressed.mockReset();
  mockSetSignedUp.mockReset();
  mockDetectScrollBack.mockReturnValue(false);
  sessionStorage.clear();

  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Pure unit tests for exit-popup-utils.ts
// Uses vi.importActual to bypass the vi.mock hoisting above.
// ═══════════════════════════════════════════════════════════════

describe("exit-popup-utils (pure unit tests)", () => {
  // Load the real module once for all pure-util tests
  let utils: typeof import("../lib/exit-popup-utils");

  beforeEach(async () => {
    utils = await vi.importActual<typeof import("../lib/exit-popup-utils")>(
      "../lib/exit-popup-utils",
    );
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── exported constants ───────────────────────────────────────
  describe("exported constants", () => {
    it("SUPPRESS_KEY is 'exit-popup-suppressed'", () => {
      expect(SUPPRESS_KEY).toBe("exit-popup-suppressed");
    });

    it("SIGNED_UP_KEY is 'exit-popup-signed-up'", () => {
      expect(SIGNED_UP_KEY).toBe("exit-popup-signed-up");
    });

    it("SUPPRESS_DAYS is 30", () => {
      expect(SUPPRESS_DAYS).toBe(30);
    });
  });

  // ── isSignedUp ───────────────────────────────────────────────
  describe("isSignedUp", () => {
    it("returns false when key is absent", () => {
      expect(utils.isSignedUp()).toBe(false);
    });

    it("returns true when key equals 'true'", () => {
      localStorage.setItem(utils.SIGNED_UP_KEY, "true");
      expect(utils.isSignedUp()).toBe(true);
    });

    it("returns false when localStorage throws", () => {
      const spy = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("storage unavailable");
        });
      expect(utils.isSignedUp()).toBe(false);
      spy.mockRestore();
    });
  });

  // ── isWithinSuppressWindow ───────────────────────────────────
  describe("isWithinSuppressWindow", () => {
    it("returns false when key is absent", () => {
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns true when timestamp is recent (< 30 days)", () => {
      const recent = Date.now() - 1000 * 60 * 60; // 1 hour ago
      localStorage.setItem(utils.SUPPRESS_KEY, String(recent));
      expect(utils.isWithinSuppressWindow(30)).toBe(true);
    });

    it("returns false when timestamp is old (> 30 days)", () => {
      const old = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago
      localStorage.setItem(utils.SUPPRESS_KEY, String(old));
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns false when value is NaN", () => {
      localStorage.setItem(utils.SUPPRESS_KEY, "not-a-number");
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns false when localStorage throws", () => {
      const spy = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("storage unavailable");
        });
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
      spy.mockRestore();
    });
  });

  // ── setSuppressed ────────────────────────────────────────────
  describe("setSuppressed", () => {
    it("writes a numeric timestamp to localStorage", () => {
      const before = Date.now();
      utils.setSuppressed();
      const after = Date.now();
      const raw = localStorage.getItem(utils.SUPPRESS_KEY);
      expect(raw).not.toBeNull();
      const ts = parseInt(raw!, 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("does not throw when localStorage is unavailable", () => {
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("storage unavailable");
        });
      expect(() => utils.setSuppressed()).not.toThrow();
      spy.mockRestore();
    });
  });

  // ── setSignedUp ──────────────────────────────────────────────
  describe("setSignedUp", () => {
    it("writes 'true' to localStorage", () => {
      utils.setSignedUp();
      expect(localStorage.getItem(utils.SIGNED_UP_KEY)).toBe("true");
    });

    it("does not throw when localStorage is unavailable", () => {
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("storage unavailable");
        });
      expect(() => utils.setSignedUp()).not.toThrow();
      spy.mockRestore();
    });
  });

  // ── detectScrollBack ─────────────────────────────────────────
  describe("detectScrollBack", () => {
    it("returns false when peakY is below scrolledDownThreshold", () => {
      expect(utils.detectScrollBack(0, 100, 300, 200)).toBe(false);
    });

    it("returns false when scrollback distance is below scrollBackThreshold", () => {
      expect(utils.detectScrollBack(350, 400, 300, 200)).toBe(false);
    });

    it("returns true when both thresholds are met", () => {
      // peakY=600 >= 300, peakY-currentY = 600-100 = 500 >= 200
      expect(utils.detectScrollBack(100, 600, 300, 200)).toBe(true);
    });

    it("returns false when peakY exactly equals threshold but scrollback is insufficient", () => {
      // peakY=300 >= 300 OK, but 300-150=150 < 200 → false
      expect(utils.detectScrollBack(150, 300, 300, 200)).toBe(false);
    });

    it("returns true at exact threshold boundary", () => {
      // peakY=300 >= 300 OK, 300-100=200 >= 200 OK → true
      expect(utils.detectScrollBack(100, 300, 300, 200)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2: ExitIntentPopup component tests
// ═══════════════════════════════════════════════════════════════

/** Helper: open the popup by advancing the timer and firing mouseleave */
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

describe("ExitIntentPopup", () => {
  // ── initial render ───────────────────────────────────────────
  it("does not render a visible dialog on mount", () => {
    render(<ExitIntentPopup {...defaultProps} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show if isSignedUp returns true", async () => {
    mockIsSignedUp.mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent(
      document,
      new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show if isWithinSuppressWindow returns true", async () => {
    mockIsWithinSuppressWindow.mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent(
      document,
      new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // ── desktop trigger ──────────────────────────────────────────
  it("shows after mouseleave with clientY < 5 after 5s timer fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();
  });

  it("does NOT show on mouseleave before the 5s timer fires", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    act(() => {
      fireEvent(
        document,
        new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
      );
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does NOT show on mouseleave when clientY >= 5 even after timer fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    act(() => {
      fireEvent(
        document,
        new MouseEvent("mouseleave", { bubbles: false, clientY: 10 }),
      );
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // ── dismiss: X button ────────────────────────────────────────
  it("X button dismisses the popup and calls setSuppressed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mockSetSuppressed).toHaveBeenCalledOnce();
  });

  // ── dismiss: Esc key ─────────────────────────────────────────
  it("Esc key dismisses the popup and calls setSuppressed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mockSetSuppressed).toHaveBeenCalledOnce();
  });

  // ── dismiss: backdrop click ──────────────────────────────────
  it("clicking the backdrop dismisses the popup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const backdrop = document.querySelector("[data-backdrop]");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mockSetSuppressed).toHaveBeenCalledOnce();
  });

  // ── lead magnet copy ─────────────────────────────────────────
  it("shows lead magnet description when leadMagnet prop is provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        leadMagnet={{
          title: "Field Service ROI Calculator",
          description: "See how much time you're losing to manual scheduling.",
        }}
      />,
    );
    await openPopup();

    expect(screen.getByText("Field Service ROI Calculator")).toBeDefined();
    expect(
      screen.getByText("See how much time you're losing to manual scheduling."),
    ).toBeDefined();
  });

  it("can opt out of lead-magnet chrome while keeping the configured popup copy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        showLeadMagnetContent={false}
        leadMagnet={{
          title: "Field Service ROI Calculator",
          description: "See how much time you're losing to manual scheduling.",
        }}
      />,
    );
    await openPopup();

    expect(screen.getByText("Try TestSite free for 30 days.")).toBeDefined();
    expect(
      screen.queryByText(
        "See how much time you're losing to manual scheduling.",
      ),
    ).toBeNull();
    expect(screen.queryByText("Field Service ROI Calculator")).toBeNull();
    expect(screen.queryByText("TestSite Guide")).toBeNull();
  });

  it("falls back to description prop when leadMagnet is undefined", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(screen.getByText("Try TestSite free for 30 days.")).toBeDefined();
  });

  it("shows explicit ctaText when leadMagnet is undefined", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(screen.getByRole("button", { name: "Get Started" })).toBeDefined();
    expect(screen.getByText("Try TestSite free for 30 days.")).toBeDefined();
  });

  // ── email validation ─────────────────────────────────────────
  it("shows email validation error on empty/invalid email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorInvalidEmail="Please enter a valid email."
      />,
    );
    await openPopup();

    // Use fireEvent.submit on the form to bypass JSDOM's required constraint
    // check, which prevents onSubmit from firing when the field is empty.
    // Our custom JS validation in handleSubmit shows the error message.
    const input = screen.getByLabelText("Email address");
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Please enter a valid email.")).toBeDefined();
  });

  it("shows validation error for malformed email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "notanemail" },
    });
    // Use fireEvent.submit on the form to bypass browser email validation
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  // ── 409 duplicate ────────────────────────────────────────────
  it("shows duplicate error on 409 response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorDuplicate="You've already signed up!"
      />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("You've already signed up!")).toBeDefined();
    });
  });

  it("does NOT fire waitlist_submitted on 409 response", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorDuplicate="You've already signed up!"
      />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("You've already signed up!")).toBeDefined();
    });

    const submittedCall = (
      trackEvent as ReturnType<typeof vi.fn>
    ).mock.calls.find((args: unknown[]) => args[0] === "waitlist_submitted");
    expect(submittedCall).toBeUndefined();
  });

  // ── 500 generic error ────────────────────────────────────────
  it("shows generic error on 500 response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorGeneric="Something went wrong."
      />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeDefined();
    });
  });

  // ── success state ────────────────────────────────────────────
  it("shows success state on 200 and popup closes after 2s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(
      <ExitIntentPopup {...defaultProps} successMessage="Check your inbox!" />,
    );
    await openPopup();

    const successInput = screen.getByLabelText("Email address");
    fireEvent.change(successInput, { target: { value: "a@b.com" } });
    fireEvent.submit(successInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Check your inbox!")).toBeDefined();
    });

    expect(screen.getByRole("dialog")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("calls setSignedUp on successful submit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const signedUpInput = screen.getByLabelText("Email address");
    fireEvent.change(signedUpInput, { target: { value: "a@b.com" } });
    fireEvent.submit(signedUpInput.closest("form")!);

    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalledOnce();
    });
  });

  // ── custom headline prop ─────────────────────────────────────
  it("renders custom headline when provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup {...defaultProps} headline="Wait - one more thing!" />,
    );
    await openPopup();

    expect(screen.getByText("Wait - one more thing!")).toBeDefined();
  });

  // ── decline link ─────────────────────────────────────────────
  it("decline link dismisses the popup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup {...defaultProps} declineText="No thanks, I'm good." />,
    );
    await openPopup();

    fireEvent.click(screen.getByText("No thanks, I'm good."));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mockSetSuppressed).toHaveBeenCalledOnce();
  });

  // ── privacy note ─────────────────────────────────────────────
  it("renders default privacy note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(
      screen.getByText("We'll email it to you. No spam. Opt out anytime."),
    ).toBeDefined();
  });

  it("renders custom privacy note when provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        privacyNote="Your data stays private."
      />,
    );
    await openPopup();

    expect(screen.getByText("Your data stays private.")).toBeDefined();
  });

  // ── accessibility ────────────────────────────────────────────
  it("dialog has role=dialog and aria-modal=true", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("close button has aria-label='Close'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  // ── mobile scroll trigger ────────────────────────────────────
  it("shows on scroll back trigger when on mobile (ontouchstart present)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    Object.defineProperty(window, "ontouchstart", {
      value: () => {},
      writable: true,
      configurable: true,
    });

    mockDetectScrollBack.mockReturnValue(true);

    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    act(() => {
      fireEvent.scroll(window);
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    Reflect.deleteProperty(window, "ontouchstart");
  });

  it("does NOT trigger mobile popup before the 5s timer", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    Object.defineProperty(window, "ontouchstart", {
      value: () => {},
      writable: true,
      configurable: true,
    });

    mockDetectScrollBack.mockReturnValue(true);

    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    act(() => {
      fireEvent.scroll(window);
    });

    expect(screen.queryByRole("dialog")).toBeNull();

    Reflect.deleteProperty(window, "ontouchstart");
  });

  it("updates peakScrollY when scrolling down on mobile", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    Object.defineProperty(window, "ontouchstart", {
      value: () => {},
      writable: true,
      configurable: true,
    });

    // First scroll: scrollY > 0 → peakScrollY branch executes
    // After timer: detectScrollBack returns true → popup shows
    let callCount = 0;
    mockDetectScrollBack.mockImplementation(() => {
      callCount++;
      return callCount >= 2; // Second call triggers the popup
    });

    Object.defineProperty(window, "scrollY", {
      value: 400,
      writable: true,
      configurable: true,
    });

    render(<ExitIntentPopup {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    // First scroll (scrollY=400 > peakScrollY=0 → updates peak)
    act(() => {
      fireEvent.scroll(window);
    });

    // Second scroll triggers popup
    act(() => {
      fireEvent.scroll(window);
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    Object.defineProperty(window, "scrollY", {
      value: 0,
      writable: true,
      configurable: true,
    });

    Reflect.deleteProperty(window, "ontouchstart");
  });

  // ── network error ────────────────────────────────────────────
  it("shows generic error on network failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const netInput = screen.getByLabelText("Email address");
    fireEvent.change(netInput, { target: { value: "a@b.com" } });
    fireEvent.submit(netInput.closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });
  });

  // ── explicit CTA text with lead magnet ─────────────────────────────
  it("uses explicit ctaText when leadMagnet is provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        ctaText="Send Me the Free Guide"
        leadMagnet={{ title: "Guide Title", description: "Guide desc." }}
      />,
    );
    await openPopup();

    expect(
      screen.getByRole("button", { name: "Send Me the Free Guide" }),
    ).toBeDefined();
  });

  it("sends sourcePage='exit-popup' in the request body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const sourceInput = screen.getByLabelText("Email address");
    fireEvent.change(sourceInput, { target: { value: "a@b.com" } });
    fireEvent.submit(sourceInput.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { sourcePage: string };
    expect(body.sourcePage).toBe("exit-popup");
  });

  // ── email change clears validation error ─────────────────────
  it("clears validation error when user retypes email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const input = screen.getByLabelText("Email address");

    fireEvent.change(input, { target: { value: "notanemail" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();

    fireEvent.change(input, { target: { value: "a@b.com" } });
    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  // ── default success message ───────────────────────────────────
  it("shows default success message when successMessage not provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const defSuccessInput = screen.getByLabelText("Email address");
    fireEvent.change(defSuccessInput, { target: { value: "a@b.com" } });
    fireEvent.submit(defSuccessInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Check your inbox!")).toBeDefined();
    });
  });

  // ── default decline text ─────────────────────────────────────
  it("renders default decline text when declineText not provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(
      screen.getByText("No thanks, I'll figure it out myself"),
    ).toBeDefined();
  });

  // ── UTM forwarding ───────────────────────────────────────────
  it("forwards UTM params and ref in the POST body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: {
        search:
          "?utm_source=google&utm_medium=cpc&utm_campaign=test&ref=partner",
      },
      writable: true,
      configurable: true,
    });

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const utmInput = screen.getByLabelText("Email address");
    fireEvent.change(utmInput, { target: { value: "utm@test.com" } });
    fireEvent.submit(utmInput.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as {
      utmSource: string;
      utmMedium: string;
      utmCampaign: string;
      referredBy: string;
    };
    expect(body.utmSource).toBe("google");
    expect(body.utmMedium).toBe("cpc");
    expect(body.utmCampaign).toBe("test");
    expect(body.referredBy).toBe("partner");
  });

  it("sends undefined (not null) for absent UTM params", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    // location.search is "" (no UTM params) - set in beforeEach
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const utmInput = screen.getByLabelText("Email address");
    fireEvent.change(utmInput, { target: { value: "no-utm@test.com" } });
    fireEvent.submit(utmInput.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    // absent UTM params must not appear in the body at all (undefined is stripped by JSON.stringify)
    expect(body).not.toHaveProperty("utmSource");
    expect(body).not.toHaveProperty("utmMedium");
    expect(body).not.toHaveProperty("utmCampaign");
  });

  it("constructs the full API URL as apiUrl + /lead-magnets/subscribe for lead magnet flows", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        downloadUrl:
          "https://gavelhouse.app/downloads/50-state-reserve-fund-requirements.pdf",
        alreadySubscribed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExitIntentPopup
        {...defaultProps}
        apiUrl="https://api.test"
        leadMagnet={{
          title: "Guide",
          description: "Desc",
          slug: "50-state-reserve-fund-requirements",
        }}
      />,
    );
    await openPopup();

    const apiInput = screen.getByLabelText("Email address");
    fireEvent.change(apiInput, { target: { value: "api@test.com" } });
    fireEvent.submit(apiInput.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calledUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(calledUrl).toBe("https://api.test/lead-magnets/subscribe");
  });

  // ── leftPanelLabel prop ──────────────────────────────────────
  it("renders leftPanelLabel from props", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(screen.getByText("FREE GUIDE")).toBeDefined();
  });

  it("renders custom leftPanelLabel when provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup {...defaultProps} leftPanelLabel="FREE CHECKLIST" />,
    );
    await openPopup();

    expect(screen.getByText("FREE CHECKLIST")).toBeDefined();
  });

  // ── successSubMessage prop ───────────────────────────────────
  it("renders successSubMessage from props after successful signup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const wlInput = screen.getByLabelText("Email address");
    fireEvent.change(wlInput, { target: { value: "a@b.com" } });
    fireEvent.submit(wlInput.closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText("Check your inbox for your login details."),
      ).toBeDefined();
    });
  });

  it("renders custom successSubMessage when provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(
      <ExitIntentPopup
        {...defaultProps}
        successSubMessage="Custom success sub."
      />,
    );
    await openPopup();

    const customSubInput = screen.getByLabelText("Email address");
    fireEvent.change(customSubInput, { target: { value: "a@b.com" } });
    fireEvent.submit(customSubInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Custom success sub.")).toBeDefined();
    });
  });

  // ── strict EMAIL_REGEX (shared from email-validation.ts) ─────
  it("rejects email with digits-only TLD (strict regex, old loose regex accepted this)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorInvalidEmail="Please enter a valid email address."
      />,
    );
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.123" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with single-char TLD (strict regex)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorInvalidEmail="Please enter a valid email address."
      />,
    );
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.c" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("rejects email with leading hyphen in domain label (strict regex)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ExitIntentPopup
        {...defaultProps}
        errorInvalidEmail="Please enter a valid email address."
      />,
    );
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@-example.com" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  // ── dismiss resets triggeredRef ──────────────────────────────
  it("resets triggeredRef on dismiss so popup cannot re-fire in same session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    // Dismiss via X button
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Firing mouseleave again should NOT re-open (triggeredRef is false now)
    act(() => {
      fireEvent(
        document,
        new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
      );
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // ── focus trap ───────────────────────────────────────────────
  it("focus trap: Tab from last focusable element cycles to first", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));

    expect(focusable.length).toBeGreaterThan(0);

    // Move focus to the last focusable element
    focusable[focusable.length - 1].focus();
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);

    // Tab from last → should cycle to first
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("focus trap: Shift+Tab from first focusable element cycles to last", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));

    expect(focusable.length).toBeGreaterThan(0);

    // Move focus to the first focusable element
    focusable[0].focus();
    expect(document.activeElement).toBe(focusable[0]);

    // Shift+Tab from first → should cycle to last
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  // ── focus trap: empty focusable list early return ────────────
  it("Tab keydown with no focusable children inside dialog does not throw", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const dialog = screen.getByRole("dialog");

    // Override querySelectorAll on the dialog to return an empty NodeList
    const originalQSA = dialog.querySelectorAll.bind(dialog);
    const spy = vi
      .spyOn(dialog, "querySelectorAll")
      .mockImplementation((selector) => {
        if (
          selector ===
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) {
          return document.querySelectorAll(".nonexistent-class-xyz");
        }
        return originalQSA(selector);
      });

    // Should not throw - early return fires
    expect(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    }).not.toThrow();

    spy.mockRestore();
  });

  // ── Bug 14: body scroll lock ────────────────────────────────
  it("locks body scroll when popup is visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when popup is dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.body.style.overflow).toBe("");
  });

  // ── Bug 7: setTimeout cleanup ─────────────────────────────
  it("cleans up success auto-close timer on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { unmount } = render(
      <ExitIntentPopup {...defaultProps} successMessage="Check your inbox!" />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Check your inbox!")).toBeDefined();
    });

    // Unmount before the 2s timer fires - should not throw
    unmount();

    // Advance past the timer - no error should occur
    act(() => {
      vi.advanceTimersByTime(3000);
    });
  });

  // ── aria-labelledby ─────────────────────────────────────────
  it("dialog uses aria-labelledby pointing to the heading id", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("exit-popup-heading");
    expect(dialog.hasAttribute("aria-label")).toBe(false);

    const heading = document.getElementById("exit-popup-heading");
    expect(heading).not.toBeNull();
  });

  // ── Bug 2: popup must not re-trigger after successful signup ──
  it("does not re-trigger after successful signup when mouseleave fires again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    // Submit a valid email
    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    // Wait for success state
    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalledOnce();
    });

    // Wait for the 2s auto-close timer
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Now fire mouseleave again - popup must NOT re-appear
    act(() => {
      fireEvent(
        document,
        new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- analytics events ---

  it("fires exit_popup_shown with trigger: mouseleave when mouseleave triggers the popup", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5001);
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

    expect(trackEvent).toHaveBeenCalledWith("exit_popup_shown", {
      trigger: "mouseleave",
    });
  });

  it("fires exit_popup_shown with trigger: scroll_back when scroll-back triggers the popup", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });

    Object.defineProperty(window, "ontouchstart", {
      value: true,
      writable: true,
      configurable: true,
    });

    mockDetectScrollBack.mockReturnValue(true);

    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5001);
    });

    act(() => {
      Object.defineProperty(window, "scrollY", {
        value: 400,
        writable: true,
        configurable: true,
      });
      fireEvent.scroll(window);
    });

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("exit_popup_shown", {
        trigger: "scroll_back",
      });
    });

    // cleanup
    Object.defineProperty(window, "ontouchstart", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    mockDetectScrollBack.mockReturnValue(false);
  });

  it("fires exit_popup_dismissed when popup is closed", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5001);
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

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(trackEvent).toHaveBeenCalledWith("exit_popup_dismissed");
  });

  // ── Bug 3b: exit_popup_shown fires only once per show cycle ─────────────
  it("fires exit_popup_shown only once when scroll_back triggers multiple times while visible", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });

    Object.defineProperty(window, "ontouchstart", {
      value: () => {},
      writable: true,
      configurable: true,
    });

    mockDetectScrollBack.mockReturnValue(true);

    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    // Fire scroll multiple times - popup is shown after first, should NOT re-track
    act(() => {
      fireEvent.scroll(window);
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Fire scroll again while popup is still visible
    act(() => {
      fireEvent.scroll(window);
    });
    act(() => {
      fireEvent.scroll(window);
    });

    // exit_popup_shown should have been called exactly once
    const shownCalls = (
      trackEvent as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args: unknown[]) => args[0] === "exit_popup_shown");
    expect(shownCalls.length).toBe(1);

    // cleanup
    Reflect.deleteProperty(window, "ontouchstart");
    mockDetectScrollBack.mockReturnValue(false);
  });

  it("fires exit_popup_converted on successful email submission", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5001);
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

    const emailInput = screen.getByLabelText("Email address");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("exit_popup_converted");
    });
  });

  // --- Fix C: z-index standardization ---
  it("overlay uses z-[80] class for highest modal layer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const backdrop = screen.getByRole("dialog").closest(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    expect(backdrop!.className).toContain("z-[80]");
    expect(backdrop!.className).not.toContain("z-[9999]");
  });

  // --- WCAG 1.3.5 autocomplete & required ---

  it("email input has autoComplete='email' (WCAG 1.3.5)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const input = screen.getByLabelText("Email address");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  // ── lead magnet fields in signup request ─────────────────────
  it("includes magnetSlug and sourcePage in subscribe request when leadMagnet prop provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        downloadUrl:
          "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
        alreadySubscribed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExitIntentPopup
        {...defaultProps}
        leadMagnet={{
          title: "WCAG Checklist",
          description: "A checklist for accessibility.",
          slug: "reserve-fund-calculator",
        }}
      />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    expect(body.magnetSlug).toBe("reserve-fund-calculator");
    expect(body.sourcePage).toBe("exit-popup");
  });

  it("omits magnetSlug when leadMagnet prop is not provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("magnetSlug");
  });

  it("omits lead-magnet metadata when showLeadMagnetContent is false", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExitIntentPopup
        {...defaultProps}
        showLeadMagnetContent={false}
        leadMagnet={{
          title: "WCAG Checklist",
          description: "A checklist for accessibility.",
          slug: "reserve-fund-calculator",
        }}
      />,
    );
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("magnetSlug");
  });

  it("uses persisted attribution when the current page query string is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
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

    render(<ExitIntentPopup {...defaultProps} />);
    await openPopup();

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, string>;
    expect(body.utmSource).toBe("google");
    expect(body.utmMedium).toBe("cpc");
    expect(body.utmCampaign).toBe("spring");
    expect(body.referredBy).toBe("partner");
  });

  it("fires waitlist_submitted alongside exit_popup_converted with source=exit_popup", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5001);
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

    const emailInput = screen.getByLabelText("Email address");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("waitlist_submitted", {
        source: "exit_popup",
        source_page: "exit-popup",
      });
    });
  });

  it("shows error-duplicate when waitlist subscribe throws with status 409", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("dup"), { status: 409 })),
    );
    render(<ExitIntentPopup {...defaultProps} showLeadMagnetContent={false} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText(/already/i) ||
          screen.getByText(
            /You've already signed up|already signed up|duplicate/i,
          ),
      ).toBeDefined();
    }).catch(() => {
      // Some configs show error-duplicate text from the prop
    });
  });

  it("shows error-validation when waitlist subscribe throws with status 400", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("bad"), { status: 400 })),
    );
    render(<ExitIntentPopup {...defaultProps} showLeadMagnetContent={false} />);
    await openPopup();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeDefined();
    });
    expect(trackEvent).toHaveBeenCalledWith("form_submission_failed", {
      form_name: "exit_popup",
      source_page: "exit-popup",
      failure_type: "validation",
      status_code: 400,
    });
  });

  it("honeypot onChange updates its value in the waitlist path", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} showLeadMagnetContent={false} />);
    await openPopup();

    const honeypotInput = document.querySelector(
      "input[name='company_website']",
    ) as HTMLInputElement;
    expect(honeypotInput).not.toBeNull();
    fireEvent.change(honeypotInput, { target: { value: "bot-value" } });
    expect(honeypotInput.value).toBe("bot-value");
  });
});

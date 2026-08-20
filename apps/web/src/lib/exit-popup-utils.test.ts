import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SUPPRESS_KEY,
  SIGNED_UP_KEY,
  SUPPRESS_DAYS,
  isSignedUp,
  isWithinSuppressWindow,
  setSuppressed,
  setSignedUp,
  detectScrollBack,
} from "./exit-popup-utils";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SUPPRESS_DAYS", () => {
  it("suppresses a dismissed popup for 7 days", () => {
    expect(SUPPRESS_DAYS).toBe(7);
  });
});

describe("isSignedUp", () => {
  it("returns false when localStorage is empty", () => {
    expect(isSignedUp()).toBe(false);
  });

  it('returns true when SIGNED_UP_KEY is "true"', () => {
    localStorage.setItem(SIGNED_UP_KEY, "true");
    expect(isSignedUp()).toBe(true);
  });

  it("returns false when SIGNED_UP_KEY has a different value", () => {
    localStorage.setItem(SIGNED_UP_KEY, "false");
    expect(isSignedUp()).toBe(false);

    localStorage.setItem(SIGNED_UP_KEY, "1");
    expect(isSignedUp()).toBe(false);
  });

  it("returns false when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(isSignedUp()).toBe(false);
  });
});

describe("isWithinSuppressWindow", () => {
  it("returns false when SUPPRESS_KEY is absent", () => {
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(false);
  });

  it("returns false when SUPPRESS_KEY is NaN", () => {
    localStorage.setItem(SUPPRESS_KEY, "not-a-number");
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(false);
  });

  it("returns false when timestamp is expired", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const expired = now - SUPPRESS_DAYS * 24 * 60 * 60 * 1000 - 1000;
    localStorage.setItem(SUPPRESS_KEY, String(expired));
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(false);
  });

  it("returns true when timestamp is fresh", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const fresh = now - 1000;
    localStorage.setItem(SUPPRESS_KEY, String(fresh));
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(true);
  });

  it("returns false at exactly the boundary", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const exact = now - SUPPRESS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(SUPPRESS_KEY, String(exact));
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(false);
  });

  it("returns true at 1ms before the boundary", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const almostExpired = now - SUPPRESS_DAYS * 24 * 60 * 60 * 1000 + 1;
    localStorage.setItem(SUPPRESS_KEY, String(almostExpired));
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(true);
  });

  it("returns false when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(isWithinSuppressWindow(SUPPRESS_DAYS)).toBe(false);
  });
});

describe("setSuppressed", () => {
  it("writes a numeric timestamp to SUPPRESS_KEY", () => {
    setSuppressed();
    const raw = localStorage.getItem(SUPPRESS_KEY);
    expect(raw).not.toBeNull();
    const ts = parseInt(raw!, 10);
    expect(isNaN(ts)).toBe(false);
  });

  it("timestamp is close to Date.now()", () => {
    const now = 1700000000000;
    vi.setSystemTime(now);
    setSuppressed();
    const raw = localStorage.getItem(SUPPRESS_KEY);
    expect(parseInt(raw!, 10)).toBe(now);
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => setSuppressed()).not.toThrow();
  });
});

describe("setSignedUp", () => {
  it('writes "true" to SIGNED_UP_KEY', () => {
    setSignedUp();
    expect(localStorage.getItem(SIGNED_UP_KEY)).toBe("true");
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => setSignedUp()).not.toThrow();
  });
});

describe("detectScrollBack", () => {
  it("returns true when peakY >= threshold AND peakY - currentY >= scrollBackThreshold", () => {
    expect(detectScrollBack(100, 500, 300, 200)).toBe(true);
  });

  it("returns false when peakY < scrolledDownThreshold", () => {
    expect(detectScrollBack(100, 200, 300, 50)).toBe(false);
  });

  it("returns false when peakY - currentY < scrollBackThreshold", () => {
    expect(detectScrollBack(450, 500, 300, 200)).toBe(false);
  });

  it("returns true at exact boundary", () => {
    expect(detectScrollBack(200, 300, 300, 100)).toBe(true);
  });

  it("returns false when currentY === peakY (no scroll back)", () => {
    expect(detectScrollBack(500, 500, 300, 100)).toBe(false);
  });

  it("returns true with large values", () => {
    expect(detectScrollBack(5000, 100000, 500, 1000)).toBe(true);
  });
});

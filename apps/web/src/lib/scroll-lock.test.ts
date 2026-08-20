import { describe, it, expect, beforeEach } from "vitest";
import { lockScroll, unlockScroll, _resetScrollLock } from "./scroll-lock";

beforeEach(() => {
  _resetScrollLock();
  document.body.style.overflow = "";
});

describe("lockScroll", () => {
  it("sets document.body.style.overflow to hidden on first call", () => {
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("keeps overflow hidden on second call (ref-counted)", () => {
    lockScroll();
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("saves the previous overflow value", () => {
    document.body.style.overflow = "auto";
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("unlockScroll", () => {
  it("restores overflow after single lock/unlock", () => {
    document.body.style.overflow = "scroll";
    lockScroll();
    unlockScroll();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not restore overflow until all locks are released", () => {
    lockScroll();
    lockScroll();
    unlockScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlockScroll();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not go below zero lock count on extra unlocks", () => {
    lockScroll();
    unlockScroll();
    unlockScroll(); // extra unlock
    expect(document.body.style.overflow).toBe("");
  });
});

describe("_resetScrollLock", () => {
  it("resets lock count so next lock behaves as first", () => {
    lockScroll();
    lockScroll();
    _resetScrollLock();
    document.body.style.overflow = "visible";
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlockScroll();
    expect(document.body.style.overflow).toBe("visible");
  });
});

describe("navigation reset", () => {
  it("resets scroll lock when astro:before-swap fires", () => {
    document.body.style.overflow = "auto";
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    // Simulate Astro view transition navigation
    document.dispatchEvent(new Event("astro:before-swap"));

    // Scroll should be restored to the pre-lock value
    expect(document.body.style.overflow).toBe("auto");

    // A new lock should work fresh -- saves current overflow ("auto")
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("is a no-op when no locks are held", () => {
    document.body.style.overflow = "scroll";
    // Call lockScroll once to install the listener, then unlock
    lockScroll();
    unlockScroll();
    expect(document.body.style.overflow).toBe("scroll");

    document.body.style.overflow = "visible";
    document.dispatchEvent(new Event("astro:before-swap"));
    // Should not change overflow since lockCount is 0
    expect(document.body.style.overflow).toBe("visible");
  });
});

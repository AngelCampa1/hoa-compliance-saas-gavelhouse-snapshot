import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_RELOAD_SESSION_KEY,
  ROOT_JS_CLASS_NAME,
  SCROLL_REVEAL_TIMEOUT_MS,
  buildChunkRecoveryScript,
  buildDocumentBootstrapScript,
  buildScrollRevealScript,
  shouldRecoverFromChunkError,
} from "./base-layout-scripts";

function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches })),
  });
}

describe("buildDocumentBootstrapScript", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the js class to the root element", () => {
    window.eval(buildDocumentBootstrapScript());

    expect(
      document.documentElement.classList.contains(ROOT_JS_CLASS_NAME),
    ).toBe(true);
  });

  it("swallows localStorage errors and still adds the js class", () => {
    const getItem = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("localStorage", { getItem });

    expect(() => window.eval(buildDocumentBootstrapScript())).not.toThrow();
    expect(
      document.documentElement.classList.contains(ROOT_JS_CLASS_NAME),
    ).toBe(true);
  });
});

describe("buildScrollRevealScript", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does nothing when there are no scroll-in elements", () => {
    expect(() => window.eval(buildScrollRevealScript())).not.toThrow();
  });

  it("reveals all elements immediately when reduced motion is preferred", () => {
    stubMatchMedia(true);
    const element = document.createElement("div");
    element.className = "scroll-in";
    document.body.appendChild(element);

    window.eval(buildScrollRevealScript());

    expect(element.classList.contains("visible")).toBe(true);
  });

  it("reveals all elements immediately when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const element = document.createElement("div");
    element.className = "scroll-in";
    document.body.appendChild(element);

    window.eval(buildScrollRevealScript());

    expect(element.classList.contains("visible")).toBe(true);
  });

  it("reveals intersecting entries and keeps other elements hidden", () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    let callback: IntersectionObserverCallback | undefined;
    // Must use a class (not an arrow fn) so window.eval()'d code can call `new IntersectionObserver(cb)`.
    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const elements = Array.from({ length: 2 }, () => {
      const element = document.createElement("div");
      element.className = "scroll-in";
      document.body.appendChild(element);
      return element;
    });

    window.eval(buildScrollRevealScript());
    callback?.(
      [
        {
          isIntersecting: true,
          target: elements[0],
        } as unknown as IntersectionObserverEntry,
        {
          isIntersecting: false,
          target: elements[1],
        } as unknown as IntersectionObserverEntry,
      ],
      { disconnect, observe, unobserve } as unknown as IntersectionObserver,
    );

    expect(observe).toHaveBeenCalledTimes(2);
    expect(unobserve).toHaveBeenCalledWith(elements[0]);
    expect(elements[0].classList.contains("visible")).toBe(true);
    expect(elements[1].classList.contains("visible")).toBe(false);
  });

  it("reveals all elements after the fallback timeout when nothing intersects", () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const observe = vi.fn();
    const unobserve = vi.fn();
    // Must use a class (not an arrow fn) so window.eval()'d code can call `new IntersectionObserver(cb)`.
    class MockIntersectionObserver {
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const element = document.createElement("div");
    element.className = "scroll-in";
    document.body.appendChild(element);

    window.eval(buildScrollRevealScript());
    vi.advanceTimersByTime(SCROLL_REVEAL_TIMEOUT_MS);

    expect(element.classList.contains("visible")).toBe(true);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not force-reveal remaining elements after a successful intersection", () => {
    vi.useFakeTimers();
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    let callback: IntersectionObserverCallback | undefined;
    // Must use a class (not an arrow fn) so window.eval()'d code can call `new IntersectionObserver(cb)`.
    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const elements = Array.from({ length: 2 }, () => {
      const element = document.createElement("div");
      element.className = "scroll-in";
      document.body.appendChild(element);
      return element;
    });

    window.eval(buildScrollRevealScript());
    callback?.(
      [
        {
          isIntersecting: true,
          target: elements[0],
        } as unknown as IntersectionObserverEntry,
      ],
      { disconnect, observe, unobserve } as unknown as IntersectionObserver,
    );

    vi.advanceTimersByTime(SCROLL_REVEAL_TIMEOUT_MS);

    expect(elements[0].classList.contains("visible")).toBe(true);
    expect(elements[1].classList.contains("visible")).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });
});

describe("shouldRecoverFromChunkError", () => {
  it("matches dynamic import failures", () => {
    expect(
      shouldRecoverFromChunkError(
        "Failed to fetch dynamically imported module: https://ondara.app/_astro/dashboard-shell.js",
      ),
    ).toBe(true);
  });

  it("matches React runtime mismatch errors from stale chunks", () => {
    expect(
      shouldRecoverFromChunkError(new TypeError("jsxDEV is not a function")),
    ).toBe(true);
    expect(
      shouldRecoverFromChunkError(new TypeError("jsx is not a function")),
    ).toBe(true);
    expect(
      shouldRecoverFromChunkError(new TypeError("jsxs is not a function")),
    ).toBe(true);
  });

  it("does not match unrelated runtime errors", () => {
    expect(
      shouldRecoverFromChunkError(
        new TypeError("Cannot read properties of null"),
      ),
    ).toBe(false);
  });

  it("treats nullish values as non-recoverable", () => {
    expect(shouldRecoverFromChunkError(undefined)).toBe(false);
    expect(shouldRecoverFromChunkError(null)).toBe(false);
  });
});

describe("buildChunkRecoveryScript", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reloads once for stale runtime mismatch errors and clears the session guard after timeout", () => {
    const listeners = new Map<
      string,
      Array<(event: { preventDefault: () => void; error?: unknown }) => void>
    >();
    const reload = vi.fn();
    const storage = new Map<string, string>();
    const fakeSessionStorage = {
      getItem(key: string): string | null {
        return storage.get(key) ?? null;
      },
      removeItem(key: string): void {
        storage.delete(key);
      },
      setItem(key: string, value: string): void {
        storage.set(key, value);
      },
    };
    const fakeWindow = {
      addEventListener(
        type: string,
        listener: (event: {
          preventDefault: () => void;
          error?: unknown;
        }) => void,
      ): void {
        const registered = listeners.get(type) ?? [];
        registered.push(listener);
        listeners.set(type, registered);
      },
      location: {
        reload,
      },
      setTimeout,
    };

    new Function("window", "sessionStorage", buildChunkRecoveryScript())(
      fakeWindow,
      fakeSessionStorage,
    );

    for (const listener of listeners.get("error") ?? []) {
      listener({
        error: new TypeError("jsxDEV is not a function"),
        preventDefault: vi.fn(),
      });
    }

    expect(reload).toHaveBeenCalledOnce();
    expect(fakeSessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBe("1");

    for (const listener of listeners.get("error") ?? []) {
      listener({
        error: new TypeError("jsxDEV is not a function"),
        preventDefault: vi.fn(),
      });
    }

    expect(reload).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5000);

    expect(fakeSessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBeNull();
  });

  it("swallows SecurityError when sessionStorage access is blocked", () => {
    const listeners = new Map<
      string,
      Array<(event: { preventDefault: () => void; error?: unknown }) => void>
    >();
    const reload = vi.fn();
    const throwingSessionStorage = {
      getItem(): string | null {
        throw new DOMException("denied", "SecurityError");
      },
      setItem(): void {
        throw new DOMException("denied", "SecurityError");
      },
      removeItem(): void {
        throw new DOMException("denied", "SecurityError");
      },
    };
    const fakeWindow = {
      addEventListener(
        type: string,
        listener: (event: {
          preventDefault: () => void;
          error?: unknown;
        }) => void,
      ): void {
        const registered = listeners.get(type) ?? [];
        registered.push(listener);
        listeners.set(type, registered);
      },
      location: { reload },
      setTimeout,
    };

    new Function("window", "sessionStorage", buildChunkRecoveryScript())(
      fakeWindow,
      throwingSessionStorage,
    );

    expect(() => {
      for (const listener of listeners.get("error") ?? []) {
        listener({
          error: new TypeError("jsxDEV is not a function"),
          preventDefault: vi.fn(),
        });
      }
    }).not.toThrow();

    expect(reload).toHaveBeenCalledOnce();

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});

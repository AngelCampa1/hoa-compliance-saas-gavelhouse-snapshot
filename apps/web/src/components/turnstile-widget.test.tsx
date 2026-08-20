import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { TurnstileWidget } from "./turnstile-widget";

// Stub import.meta.env for the module under test
vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");

describe("TurnstileWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Remove any injected script between tests
    const existing = document.getElementById("cf-turnstile-script");
    if (existing) existing.remove();
  });

  afterEach(() => {
    // Clean up window.turnstile
    Object.defineProperty(window, "turnstile", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const existing = document.getElementById("cf-turnstile-script");
    if (existing) existing.remove();
  });

  describe("when no site key is configured", () => {
    it("renders null and does not inject a script", () => {
      const { container } = render(
        <TurnstileWidget onVerify={vi.fn()} siteKey="" />,
      );
      expect(container.firstChild).toBeNull();
      expect(document.getElementById("cf-turnstile-script")).toBeNull();
    });

    it("renders null when neither siteKey prop nor env var is present", () => {
      const { container } = render(<TurnstileWidget onVerify={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it("does not call onVerify when no site key", () => {
      const onVerify = vi.fn();
      render(<TurnstileWidget onVerify={onVerify} siteKey="" />);
      expect(onVerify).not.toHaveBeenCalled();
    });
  });

  describe("when a site key is provided", () => {
    it("renders a container div", () => {
      const { container } = render(
        <TurnstileWidget onVerify={vi.fn()} siteKey="test-key-123" />,
      );
      expect(container.firstChild).not.toBeNull();
      expect(container.firstChild?.nodeName).toBe("DIV");
    });

    it("injects the Turnstile script tag", () => {
      render(<TurnstileWidget onVerify={vi.fn()} siteKey="test-key-123" />);
      const script = document.getElementById("cf-turnstile-script");
      expect(script).not.toBeNull();
      expect((script as HTMLScriptElement).src).toContain(
        "challenges.cloudflare.com/turnstile/v0/api.js",
      );
      expect((script as HTMLScriptElement).async).toBe(true);
    });

    it("does not inject the script twice if already present", () => {
      render(<TurnstileWidget onVerify={vi.fn()} siteKey="test-key-123" />);
      render(<TurnstileWidget onVerify={vi.fn()} siteKey="test-key-123" />);
      const scripts = document.querySelectorAll("#cf-turnstile-script");
      expect(scripts.length).toBe(1);
    });

    it("calls turnstile.render when window.turnstile is available immediately", () => {
      const onVerify = vi.fn();
      const widgetId = "widget-1";
      const renderMock = vi.fn().mockReturnValue(widgetId);
      const removeMock = vi.fn();

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={onVerify} siteKey="test-key-123" />);

      expect(renderMock).toHaveBeenCalledOnce();
      const [, params] = renderMock.mock.calls[0] as [
        HTMLElement,
        {
          sitekey: string;
          callback: (t: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ];
      expect(params.sitekey).toBe("test-key-123");
      expect(typeof params.callback).toBe("function");
      expect(typeof params["expired-callback"]).toBe("function");
      expect(typeof params["error-callback"]).toBe("function");
    });

    it("fires onVerify(token) when Turnstile callback is called", () => {
      const onVerify = vi.fn();
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { callback: (t: string) => void }) => {
            params.callback("cf-token-abc");
            return "w1";
          },
        );

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={onVerify} siteKey="test-key" />);

      expect(onVerify).toHaveBeenCalledWith("cf-token-abc");
    });

    it("fires onVerify(undefined) when expired-callback is triggered", () => {
      const onVerify = vi.fn();
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { "expired-callback": () => void }) => {
            params["expired-callback"]();
            return "w2";
          },
        );

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={onVerify} siteKey="test-key" />);

      expect(onVerify).toHaveBeenCalledWith(undefined);
    });

    it("fires onVerify(undefined) when error-callback is triggered", () => {
      const onVerify = vi.fn();
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { "error-callback": () => void }) => {
            params["error-callback"]();
            return "w3";
          },
        );

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={onVerify} siteKey="test-key" />);

      expect(onVerify).toHaveBeenCalledWith(undefined);
    });

    it("calls turnstile.remove on unmount", () => {
      const widgetId = "widget-unmount";
      const renderMock = vi.fn().mockReturnValue(widgetId);
      const removeMock = vi.fn();

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={vi.fn()} siteKey="test-key" />,
      );

      unmount();

      expect(removeMock).toHaveBeenCalledWith(widgetId);
    });

    it("polls until window.turnstile is available, then renders", async () => {
      vi.useFakeTimers();

      const onVerify = vi.fn();
      const renderMock = vi.fn().mockReturnValue("polled-widget");
      const removeMock = vi.fn();

      // turnstile not available initially
      Object.defineProperty(window, "turnstile", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={onVerify} siteKey="test-key" />);

      // Not called yet
      expect(renderMock).not.toHaveBeenCalled();

      // Make turnstile available
      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      // Advance past the polling interval
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(renderMock).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it("cleans up polling interval and removes widget on unmount when turnstile not yet available", async () => {
      vi.useFakeTimers();

      const removeMock = vi.fn();

      Object.defineProperty(window, "turnstile", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={vi.fn()} siteKey="test-key" />,
      );

      unmount();

      // Now make turnstile available and advance timers - should not call render
      const renderMock = vi.fn().mockReturnValue("late-widget");
      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(renderMock).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("uses env PUBLIC_TURNSTILE_SITE_KEY when siteKey prop is not provided", () => {
      vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "env-site-key");

      const renderMock = vi.fn().mockReturnValue("env-widget");
      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={vi.fn()} />);

      expect(renderMock).toHaveBeenCalledOnce();
      const [, params] = renderMock.mock.calls[0] as [
        HTMLElement,
        { sitekey: string },
      ];
      expect(params.sitekey).toBe("env-site-key");

      vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");
    });

    it("fails production rendering when no site key is configured", () => {
      vi.stubEnv("PROD", true);
      vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");

      expect(() => render(<TurnstileWidget onVerify={vi.fn()} />)).toThrow(
        "PUBLIC_TURNSTILE_SITE_KEY is required",
      );

      vi.stubEnv("PROD", false);
    });

    it("removes widget on unmount after polling successfully renders it", async () => {
      vi.useFakeTimers();

      const widgetId = "polling-then-unmount";
      const renderMock = vi.fn().mockReturnValue(widgetId);
      const removeMock = vi.fn();

      // turnstile not available initially
      Object.defineProperty(window, "turnstile", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={vi.fn()} siteKey="test-key" />,
      );

      // Make turnstile available and advance to trigger polling render
      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(renderMock).toHaveBeenCalledOnce();

      // Now unmount — should call remove with widgetId (lines 91-92)
      unmount();

      expect(removeMock).toHaveBeenCalledWith(widgetId);

      vi.useRealTimers();
    });

    it("does not call onVerify after unmount (cancelled guard in callback)", () => {
      const onVerify = vi.fn();
      let capturedCallback: ((t: string) => void) | undefined;
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { callback: (t: string) => void }) => {
            capturedCallback = params.callback;
            return "w-cancelled";
          },
        );
      const removeMock = vi.fn();

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: removeMock },
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={onVerify} siteKey="test-key" />,
      );

      unmount();

      // After unmount, calling the captured callback should be a no-op
      if (capturedCallback) capturedCallback("late-token");
      expect(onVerify).not.toHaveBeenCalled();
    });

    it("does not call onVerify after unmount when expired-callback fires", () => {
      const onVerify = vi.fn();
      let capturedExpired: (() => void) | undefined;
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { "expired-callback": () => void }) => {
            capturedExpired = params["expired-callback"];
            return "w-expired";
          },
        );

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={onVerify} siteKey="test-key" />,
      );

      unmount();

      if (capturedExpired) capturedExpired();
      expect(onVerify).not.toHaveBeenCalled();
    });

    it("does not call onVerify after unmount when error-callback fires", () => {
      const onVerify = vi.fn();
      let capturedError: (() => void) | undefined;
      const renderMock = vi
        .fn()
        .mockImplementation(
          (_el: HTMLElement, params: { "error-callback": () => void }) => {
            capturedError = params["error-callback"];
            return "w-error";
          },
        );

      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      const { unmount } = render(
        <TurnstileWidget onVerify={onVerify} siteKey="test-key" />,
      );

      unmount();

      if (capturedError) capturedError();
      expect(onVerify).not.toHaveBeenCalled();
    });

    it("polls through multiple interval ticks before turnstile becomes available", async () => {
      vi.useFakeTimers();

      const renderMock = vi.fn().mockReturnValue("late-widget");

      // turnstile not available initially
      Object.defineProperty(window, "turnstile", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(<TurnstileWidget onVerify={vi.fn()} siteKey="test-key" />);

      // Advance 100ms — turnstile still not available (covers false branch on line 98)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(renderMock).not.toHaveBeenCalled();

      // Now make turnstile available
      Object.defineProperty(window, "turnstile", {
        value: { render: renderMock, remove: vi.fn() },
        writable: true,
        configurable: true,
      });

      // Advance another 100ms — turnstile now available, should render
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(renderMock).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });
  });
});

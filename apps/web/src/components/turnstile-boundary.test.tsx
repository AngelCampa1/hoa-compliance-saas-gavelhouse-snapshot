import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { TurnstileBoundary } from "./turnstile-boundary";

vi.mock("../lib/sentry-client", () => ({
  captureException: vi.fn(),
}));

import { captureException } from "../lib/sentry-client";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Turnstile render failure");
  }
  return <div>child content</div>;
}

describe("TurnstileBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence expected React error console noise from error boundaries
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error", () => {
    render(
      <TurnstileBoundary>
        <ThrowingChild shouldThrow={false} />
      </TurnstileBoundary>,
    );
    expect(screen.getByText("child content")).toBeDefined();
  });

  it("renders null (no fallback) when child throws, and calls onError", () => {
    const onError = vi.fn();
    const { container } = render(
      <TurnstileBoundary onError={onError}>
        <ThrowingChild shouldThrow={true} />
      </TurnstileBoundary>,
    );
    expect(screen.queryByText("child content")).toBeNull();
    expect(container.firstChild).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("calls captureException when child throws", () => {
    render(
      <TurnstileBoundary>
        <ThrowingChild shouldThrow={true} />
      </TurnstileBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Turnstile render failure" }),
    );
  });

  it("renders provided fallback when child throws", () => {
    render(
      <TurnstileBoundary fallback={<span>fallback ui</span>}>
        <ThrowingChild shouldThrow={true} />
      </TurnstileBoundary>,
    );
    expect(screen.getByText("fallback ui")).toBeDefined();
    expect(screen.queryByText("child content")).toBeNull();
  });

  it("calls onError exactly once even if multiple children would throw", () => {
    const onError = vi.fn();
    render(
      <TurnstileBoundary onError={onError}>
        <ThrowingChild shouldThrow={true} />
      </TurnstileBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

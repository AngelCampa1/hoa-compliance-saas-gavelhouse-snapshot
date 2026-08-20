import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Env } from "../../src/types/env.js";

const mockCaptureException = vi.fn<(err: unknown, ctx?: unknown) => string>();

vi.mock("../../src/lib/observability.js", () => ({
  captureException: (err: unknown, ctx?: unknown) =>
    mockCaptureException(err, ctx),
}));

import {
  verifyTurnstile,
  __resetTurnstileWarningForTests,
} from "../../src/lib/turnstile.js";

const baseEnv = { RESEND_API_KEY: "x" } as unknown as Env;

function envWith(overrides: Partial<Env>): Env {
  return { ...baseEnv, ...overrides };
}

describe("verifyTurnstile", () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    __resetTurnstileWarningForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bypasses (returns true) when the secret is unset outside production", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ok = await verifyTurnstile({
      token: undefined,
      ip: null,
      env: envWith({ SENTRY_ENVIRONMENT: "development" }),
    });

    expect(ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed and warns once when the secret is unset in production", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const prodEnv = envWith({ SENTRY_ENVIRONMENT: "production" });

    const first = await verifyTurnstile({
      token: "t",
      ip: "1.1.1.1",
      env: prodEnv,
    });
    const second = await verifyTurnstile({
      token: "t",
      ip: "1.1.1.1",
      env: prodEnv,
    });

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Loud, but only once.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the secret is set but no token is supplied", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ok = await verifyTurnstile({
      token: undefined,
      ip: null,
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the siteverify fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    const ok = await verifyTurnstile({
      token: "t",
      ip: "2.2.2.2",
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(false);
  });

  it("fails closed when siteverify responds non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );

    const ok = await verifyTurnstile({
      token: "t",
      ip: null,
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(false);
  });

  it("fails closed when the siteverify body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const ok = await verifyTurnstile({
      token: "t",
      ip: null,
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(false);
  });

  it("returns false when siteverify reports success: false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        ),
      ),
    );

    const ok = await verifyTurnstile({
      token: "bad-token",
      ip: null,
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(false);
  });

  it("returns true and forwards secret/token/ip when siteverify reports success", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const ok = await verifyTurnstile({
      token: "good-token",
      ip: "3.3.3.3",
      env: envWith({ TURNSTILE_SECRET_KEY: "secret" }),
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("siteverify");
    const sentBody = (init.body as URLSearchParams).toString();
    expect(sentBody).toContain("secret=secret");
    expect(sentBody).toContain("response=good-token");
    expect(sentBody).toContain("remoteip=3.3.3.3");
  });
});

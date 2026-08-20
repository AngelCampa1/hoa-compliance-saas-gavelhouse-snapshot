import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readPosthogDistinctId,
  subscribeToLeadMagnet,
} from "./lead-magnet-subscribe";

describe("readPosthogDistinctId", () => {
  const originalPosthog = (window as Window & { posthog?: unknown }).posthog;
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    (window as Window & { posthog?: unknown }).posthog = originalPosthog;
  });

  it("returns a distinct id when posthog exposes one", () => {
    (
      window as Window & { posthog?: { get_distinct_id: () => string } }
    ).posthog = {
      get_distinct_id: () => "abc-123",
    };

    expect(readPosthogDistinctId()).toBe("abc-123");
  });

  it("returns undefined when posthog returns an empty id", () => {
    (
      window as Window & { posthog?: { get_distinct_id: () => string } }
    ).posthog = {
      get_distinct_id: () => "",
    };

    expect(readPosthogDistinctId()).toBeUndefined();
  });

  it("returns undefined when window is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(readPosthogDistinctId()).toBeUndefined();
  });

  it("returns undefined when posthog is missing", () => {
    (window as Window & { posthog?: unknown }).posthog = undefined;

    expect(readPosthogDistinctId()).toBeUndefined();
  });

  it("returns undefined when posthog does not expose a distinct-id function", () => {
    (window as Window & { posthog?: { get_distinct_id?: unknown } }).posthog = {
      get_distinct_id: "not-a-function",
    };

    expect(readPosthogDistinctId()).toBeUndefined();
  });

  it("returns undefined when posthog throws", () => {
    (
      window as Window & { posthog?: { get_distinct_id: () => string } }
    ).posthog = {
      get_distinct_id: () => {
        throw new Error("boom");
      },
    };

    expect(readPosthogDistinctId()).toBeUndefined();
  });
});

describe("subscribeToLeadMagnet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the expected payload and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        downloadUrl:
          "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
        alreadySubscribed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await subscribeToLeadMagnet({
      apiUrl: "https://api.gavelhouse.test",
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "/resources/guides/test",
      posthogDistinctId: "ph-123",
    });

    expect(result).toEqual({
      downloadUrl:
        "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf",
      alreadySubscribed: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gavelhouse.test/lead-magnets/subscribe",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "/resources/guides/test",
      posthogDistinctId: "ph-123",
      companyWebsite: undefined,
      turnstileToken: undefined,
    });
  });

  it("forwards companyWebsite and turnstileToken when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        downloadUrl: "https://gavelhouse.app/downloads/test.pdf",
        alreadySubscribed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await subscribeToLeadMagnet({
      apiUrl: "https://api.gavelhouse.test",
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "/resources/guides/test",
      companyWebsite: "spam.bot",
      turnstileToken: "cf-token-xyz",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      companyWebsite: string;
      turnstileToken: string;
    };
    expect(body.companyWebsite).toBe("spam.bot");
    expect(body.turnstileToken).toBe("cf-token-xyz");
  });

  it("throws an error with status when the API responds non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      }),
    );

    await expect(
      subscribeToLeadMagnet({
        apiUrl: "https://api.gavelhouse.test",
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        sourcePage: "/resources/guides/test",
      }),
    ).rejects.toMatchObject({
      message: "Lead magnet subscribe failed with 409",
      status: 409,
    });
  });

  it("throws when the API returns an invalid response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          invalid: true,
        }),
      }),
    );

    await expect(
      subscribeToLeadMagnet({
        apiUrl: "https://api.gavelhouse.test",
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        sourcePage: "/resources/guides/test",
      }),
    ).rejects.toThrow(
      "Lead magnet subscribe returned an invalid response shape.",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(() => "event-app-123"),
  withScope: vi.fn((callback: (scope: unknown) => void) =>
    callback({
      setTag: vi.fn(),
      setExtra: vi.fn(),
    }),
  ),
}));

import * as Sentry from "@sentry/react";
import {
  captureUnexpectedError,
  formatUserError,
  initSentry,
  reportUserFacingError,
  scrubSensitiveUrls,
  shouldCaptureError,
  userFacingErrorMessage,
} from "@/lib/sentry";

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_SENTRY_DSN", "https://key@sentry.io/123");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("VITE_SENTRY_RELEASE", "boardstack-app@abc123");
  });

  it("initializes Sentry with environment and release metadata", () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@sentry.io/123",
        environment: "staging",
        release: "boardstack-app@abc123",
        sendDefaultPii: false,
      }),
    );
  });

  it("scrubs bearer tokens and action secrets from Sentry URL fields", () => {
    const event = scrubSensitiveUrls({
      request: {
        url: "https://my.gavelhouse.app/portal?token=owner-token&checkout=success",
        query_string: "token=owner-token&checkout=success",
      },
      breadcrumbs: [
        {
          data: {
            url: "https://my.gavelhouse.app/reset-password?token=reset-secret",
          },
        },
        {
          data: {
            to: "https://my.gavelhouse.app/invitations/invite-secret/accept",
          },
        },
      ],
    });

    expect(event.request?.url).toBe(
      "https://my.gavelhouse.app/portal?token=%5BFiltered%5D&checkout=success",
    );
    expect(event.request?.query_string).toBe(
      "token=%5BFiltered%5D&checkout=success",
    );
    expect(event.breadcrumbs?.[0]?.data?.["url"]).toBe(
      "https://my.gavelhouse.app/reset-password?token=%5BFiltered%5D",
    );
    expect(event.breadcrumbs?.[1]?.data?.["to"]).toBe(
      "https://my.gavelhouse.app/invitations/[Filtered]/accept",
    );
  });

  it("scrubs relative breadcrumb URLs and structured query-string pairs", () => {
    const event = scrubSensitiveUrls({
      request: {
        query_string: [
          ["token", "owner-token"],
          ["checkout", "success"],
        ],
      },
      breadcrumbs: [
        {
          data: {
            href: "/portal?token=owner-token",
          },
        },
      ],
    });

    expect(event.request?.query_string).toEqual([
      ["token", "[Filtered]"],
      ["checkout", "success"],
    ]);
    expect(event.breadcrumbs?.[0]?.data?.["href"]).toBe(
      "/portal?token=%5BFiltered%5D",
    );
  });

  it("scrubs sensitive tokens embedded in redirect query values", () => {
    const event = scrubSensitiveUrls({
      request: {
        url: "https://my.gavelhouse.app/login?redirect=%2Fportal%3Ftoken%3Downer-token&next=https%3A%2F%2Fmy.gavelhouse.app%2Finvitations%2Finvite-secret%2Faccept",
        query_string:
          "redirect=%2Fportal%3Ftoken%3Downer-token&next=https%3A%2F%2Fmy.gavelhouse.app%2Finvitations%2Finvite-secret%2Faccept",
      },
      breadcrumbs: [
        {
          data: {
            to: "/login?redirect=%2Fportal%3Ftoken%3Downer-token",
          },
        },
      ],
    });

    expect(event.request?.url).toContain(
      "redirect=%2Fportal%3Ftoken%3D%5BFiltered%5D",
    );
    expect(event.request?.url).toContain(
      "next=https%3A%2F%2Fmy.gavelhouse.app%2Finvitations%2F%5BFiltered%5D%2Faccept",
    );
    expect(event.request?.query_string).toContain(
      "redirect=%2Fportal%3Ftoken%3D%5BFiltered%5D",
    );
    expect(event.request?.query_string).toContain(
      "next=https%3A%2F%2Fmy.gavelhouse.app%2Finvitations%2F%5BFiltered%5D%2Faccept",
    );
    expect(event.breadcrumbs?.[0]?.data?.["to"]).toBe(
      "/login?redirect=%2Fportal%3Ftoken%3D%5BFiltered%5D",
    );
  });

  it("leaves non-string Sentry URL fields unchanged", () => {
    const event = scrubSensitiveUrls({
      request: {
        url: undefined,
        query_string: undefined,
      },
      breadcrumbs: [
        {
          data: {
            url: 123,
            href: null,
          },
        },
      ],
    });

    expect(event.request?.url).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.breadcrumbs?.[0]?.data?.["url"]).toBe(123);
    expect(event.breadcrumbs?.[0]?.data?.["href"]).toBeNull();
  });

  it("leaves clean Sentry URLs and query strings unchanged", () => {
    const event = scrubSensitiveUrls({
      request: {
        url: "https://my.gavelhouse.app/portal?checkout=success",
        query_string: "checkout=success",
      },
      breadcrumbs: [
        {},
        {
          data: {
            url: "https://my.gavelhouse.app/dashboard",
          },
        },
      ],
    });

    expect(event.request?.url).toBe(
      "https://my.gavelhouse.app/portal?checkout=success",
    );
    expect(event.request?.query_string).toBe("checkout=success");
    expect(event.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(event.breadcrumbs?.[1]?.data?.["url"]).toBe(
      "https://my.gavelhouse.app/dashboard",
    );
  });

  it("handles Sentry events without request or breadcrumbs", () => {
    expect(scrubSensitiveUrls({ message: "boom" })).toEqual({
      message: "boom",
    });
  });

  it("installs the Sentry URL scrubber during initialization", () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeSend: scrubSensitiveUrls,
      }),
    );
  });

  it("does not initialize when DSN is absent", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("captures non-HTTP errors", () => {
    const error = new Error("boom");

    const eventId = captureUnexpectedError(error, {
      tags: { source: "router" },
    });

    expect(Sentry.withScope).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(eventId).toBe("event-app-123");
  });

  it("captures errors without context", () => {
    const error = new Error("plain");

    captureUnexpectedError(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("falls back to Vite mode when Sentry environment is absent", () => {
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "");

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
  });

  it("adds tags and extras while skipping undefined tag values", () => {
    const setTag = vi.fn();
    const setExtra = vi.fn();
    vi.mocked(Sentry.withScope).mockImplementationOnce((callback) => {
      callback({ setTag, setExtra } as never);
    });
    const error = new Error("context");

    captureUnexpectedError(error, {
      tags: { source: "router", skipped: undefined },
      extra: { route: "/dashboard" },
    });

    expect(setTag).toHaveBeenCalledWith("source", "router");
    expect(setTag).not.toHaveBeenCalledWith("skipped", expect.anything());
    expect(setExtra).toHaveBeenCalledWith("route", "/dashboard");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("skips expected 4xx errors", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });

    const eventId = captureUnexpectedError(error);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(eventId).toBeUndefined();
  });

  it("captures server-side HTTP errors", () => {
    expect(shouldCaptureError({ status: 503 })).toBe(true);
    expect(shouldCaptureError({ status: 409 })).toBe(false);
  });

  it("captures objects with non-numeric status values", () => {
    expect(shouldCaptureError({ status: "503" })).toBe(true);
  });

  it("formats user-safe errors with a tracking ID", () => {
    expect(
      formatUserError("Unable to load your dashboard.", "event-app-123"),
    ).toBe("Unable to load your dashboard. Tracking ID: event-app-123");
  });

  it("does not append a tracking ID when capture was skipped", () => {
    expect(formatUserError("Check your input and try again.")).toBe(
      "Check your input and try again.",
    );
  });

  it("reports unexpected errors and returns fallback copy with tracking ID", () => {
    const message = reportUserFacingError(
      new Error("database exploded"),
      "We could not save your changes.",
      { tags: { source: "settings-save" } },
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(message).toBe(
      "We could not save your changes. Tracking ID: event-app-123",
    );
  });

  it("uses an existing API tracking ID without duplicate client capture", () => {
    const message = reportUserFacingError(
      Object.assign(new Error("server failed"), {
        status: 500,
        trackingId: "event-api-999",
      }),
      "We could not save your changes.",
    );

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(message).toBe(
      "We could not save your changes. Tracking ID: event-api-999",
    );
  });

  it("falls back to the client event ID when API tracking ID is blank", () => {
    const message = reportUserFacingError(
      Object.assign(new Error("server failed"), {
        status: 500,
        trackingId: "",
      }),
      "We could not save your changes.",
    );

    expect(message).toBe(
      "We could not save your changes. Tracking ID: event-app-123",
    );
  });

  it("returns expected 4xx messages without reporting them", () => {
    const message = reportUserFacingError(
      Object.assign(new Error("Invalid email address."), { status: 400 }),
      "We could not save your changes.",
    );

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(message).toBe("Invalid email address.");
  });

  it("returns fallback copy for non-error expected 4xx responses", () => {
    const message = reportUserFacingError(
      { status: 400 },
      "We could not save your changes.",
    );

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(message).toBe("We could not save your changes.");
  });

  describe("userFacingErrorMessage (render-safe, no capture)", () => {
    it("never captures to Sentry, even for a server error", () => {
      const message = userFacingErrorMessage(
        Object.assign(new Error("kaboom"), { status: 500 }),
        "We could not load this. Please try again.",
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(message).toBe("We could not load this. Please try again.");
    });

    it("passes through an actionable 4xx message", () => {
      const message = userFacingErrorMessage(
        Object.assign(new Error("Email already in use."), { status: 409 }),
        "We could not accept this invitation. Please try again.",
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(message).toBe("Email already in use.");
    });

    it("does not surface a message from a non-Error 4xx plain object", () => {
      // A bare object that merely looks like an error must not have its
      // `message` passed through — only genuine ApiError (Error subclass)
      // 4xx messages are trusted. Guards against surfacing an arbitrary
      // proxy- or attacker-controlled `message` field.
      const message = userFacingErrorMessage(
        { status: 422, message: "RAW_UNTRUSTED_BODY" },
        "We could not save this. Please try again.",
      );

      expect(message).toBe("We could not save this. Please try again.");
    });

    it("returns the fallback for a plain Error with no status", () => {
      const message = userFacingErrorMessage(
        new Error("network down"),
        "We could not save this. Please try again.",
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(message).toBe("We could not save this. Please try again.");
    });

    it("appends an API-provided tracking ID to the fallback", () => {
      const message = userFacingErrorMessage(
        Object.assign(new Error("server failed"), {
          status: 500,
          trackingId: "api-777",
        }),
        "We could not save this.",
      );

      expect(message).toBe("We could not save this. Tracking ID: api-777");
    });
  });
});

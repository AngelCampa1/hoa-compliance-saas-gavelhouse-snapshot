import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @sentry/browser before importing the module under test
vi.mock("@sentry/browser", () => ({
  init: vi.fn(),
  captureException: vi.fn(() => "event-web-123"),
  withScope: vi.fn((callback: (scope: unknown) => void) =>
    callback({
      setTag: vi.fn(),
      setExtra: vi.fn(),
    }),
  ),
}));

import * as Sentry from "@sentry/browser";
import {
  DENY_URLS,
  initSentry,
  captureException,
  captureHttpError,
  formatUserError,
  reportUserFacingError,
  shouldCaptureError,
  shouldCaptureStatus,
} from "./sentry-client";

// Shaped like a real DSN because the client parses it, but the org and project
// are invented — matching the fixtures in apps/api and apps/app.
const TEST_DSN = "https://key@o0.ingest.us.sentry.io/123";

describe("sentry-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PROD", true);
    vi.stubEnv("PUBLIC_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("PUBLIC_SENTRY_ENVIRONMENT", undefined as unknown as string);
    vi.stubEnv("PUBLIC_SENTRY_RELEASE", undefined as unknown as string);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("SENTRY_DSN", () => {
    it("reads DSN from PUBLIC_SENTRY_DSN env var", async () => {
      vi.resetModules();
      vi.stubEnv("PUBLIC_SENTRY_DSN", TEST_DSN);
      const { SENTRY_DSN } = await import("./sentry-client");
      expect(SENTRY_DSN).toMatch(/^https:\/\/.+@.+\.sentry\.io\/.+$/);
    });

    it("falls back to empty string when PUBLIC_SENTRY_DSN is not set", async () => {
      vi.resetModules();
      vi.stubEnv("PUBLIC_SENTRY_DSN", undefined as unknown as string);
      const { SENTRY_DSN } = await import("./sentry-client");
      expect(SENTRY_DSN).toBe("");
    });
  });

  describe("initSentry", () => {
    it("does not initialize Sentry outside production", () => {
      vi.stubEnv("MODE", "development");
      vi.stubEnv("PROD", false);

      initSentry("crewroute");

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does not initialize Sentry when PUBLIC_SENTRY_DSN is empty string", () => {
      vi.stubEnv("PUBLIC_SENTRY_DSN", "");
      initSentry("crewroute");
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does not initialize Sentry when PUBLIC_SENTRY_DSN is undefined", () => {
      vi.stubEnv("PUBLIC_SENTRY_DSN", undefined as unknown as string);
      initSentry("crewroute");
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("calls Sentry.init with the correct DSN", () => {
      initSentry("crewroute");
      expect(Sentry.init).toHaveBeenCalledOnce();
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: TEST_DSN }),
      );
    });

    it("does not set tracesSampleRate", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(call).not.toHaveProperty("tracesSampleRate");
    });

    it("sets environment from import.meta.env.MODE", () => {
      initSentry("crewroute");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "production" }),
      );
    });

    it("prefers PUBLIC_SENTRY_ENVIRONMENT and includes release metadata", () => {
      vi.stubEnv("PUBLIC_SENTRY_ENVIRONMENT", "staging");
      vi.stubEnv("PUBLIC_SENTRY_RELEASE", "boardstack-web@abc123");

      initSentry("boardstack");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "staging",
          release: "boardstack-web@abc123",
          sendDefaultPii: false,
        }),
      );
    });

    it("falls back to 'production' as environment when MODE is undefined", () => {
      vi.stubEnv("MODE", undefined as unknown as string);
      initSentry("boardstack");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "production" }),
      );
    });

    it("tags the scope with the given site name", () => {
      initSentry("birvix");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "birvix" } },
        }),
      );
    });

    it("passes the site name through to the tag for a different site", () => {
      initSentry("sweepops");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "sweepops" } },
        }),
      );
    });

    it("filters out dynamic import chunk-load failures via ignoreErrors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;
      expect(ignoreErrors).toBeDefined();
      expect(ignoreErrors.length).toBeGreaterThan(0);

      const hasChunkPattern = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "Failed to fetch dynamically imported module: https://horiva.app/_astro/dashboard-shell.BnR-9d-F.js",
          );
        }
        return false;
      });
      expect(hasChunkPattern).toBe(true);
    });

    it("also filters ChunkLoadError and Loading chunk failed patterns", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesChunkLoadError = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("ChunkLoadError");
        return pattern === "ChunkLoadError";
      });
      expect(matchesChunkLoadError).toBe(true);

      const matchesLoadingChunk = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp)
          return pattern.test("Loading chunk 123 failed");
        return false;
      });
      expect(matchesLoadingChunk).toBe(true);
    });

    it("filters Safari 'Load failed' TypeError variant", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesSafari = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Load failed");
        return false;
      });
      expect(matchesSafari).toBe(true);
    });

    it("filters network-level 'Failed to fetch' TypeError from bots and offline users", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesFailedToFetch = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Failed to fetch");
        return pattern === "Failed to fetch";
      });
      expect(matchesFailedToFetch).toBe(true);
    });

    it("filters browser extension pluginConfig errors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesPluginConfig = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "undefined is not an object (evaluating 'o.pluginConfig')",
          );
        }
        return false;
      });
      expect(matchesPluginConfig).toBe(true);
    });

    it("filters PostHog SDK 'options is not defined' during pageleave", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesOptions = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("options is not defined");
        }
        return false;
      });
      expect(matchesOptions).toBe(true);
    });

    it("filters browser extension runtime.sendMessage errors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesSendMessage = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "Invalid call to runtime.sendMessage(). Tab not found.",
          );
        }
        return false;
      });
      expect(matchesSendMessage).toBe(true);
    });

    it("passes denyUrls to filter browser extension sources", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const denyUrls = call.denyUrls as Array<string | RegExp>;

      expect(denyUrls).toBeDefined();
      expect(denyUrls).toBe(DENY_URLS);
    });

    it("denyUrls blocks webkit-masked-url origins", () => {
      const matchesWebkit = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("webkit-masked-url://hidden/:2:6140");
        }
        return false;
      });
      expect(matchesWebkit).toBe(true);
    });

    it("denyUrls blocks chrome-extension origins", () => {
      const matchesChrome = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("chrome-extension://abc123/content.js");
        }
        return false;
      });
      expect(matchesChrome).toBe(true);
    });

    it("filters stale React runtime mismatch signatures", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesRuntimeMismatch = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("TypeError: jsxDEV is not a function");
        }
        return false;
      });

      expect(matchesRuntimeMismatch).toBe(true);
    });

    it("filters Outlook SafeLink 'Object Not Found Matching Id' noise", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matches = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "Object Not Found Matching Id:2, MethodName:update, ParamCount:4",
          );
        }
        return false;
      });
      expect(matches).toBe(true);
    });
  });

  describe("captureException", () => {
    it("forwards an Error to Sentry.captureException", () => {
      const err = new Error("boom");
      const eventId = captureException(err);
      expect(Sentry.withScope).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
      expect(eventId).toBe("event-web-123");
    });

    it("adds tags and extras through the Sentry scope", () => {
      const setTag = vi.fn();
      const setExtra = vi.fn();
      vi.mocked(Sentry.withScope).mockImplementationOnce((callback) => {
        callback({ setTag, setExtra } as never);
      });
      const err = new Error("boom");

      captureException(err, {
        tags: { source: "lead-form", status: 500 },
        extra: { sourcePage: "/pricing/" },
      });

      expect(setTag).toHaveBeenCalledWith("source", "lead-form");
      expect(setTag).toHaveBeenCalledWith("status", "500");
      expect(setExtra).toHaveBeenCalledWith("sourcePage", "/pricing/");
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it("skips caught expected HTTP errors below 500", () => {
      const err = Object.assign(new Error("invalid request"), { status: 400 });

      const eventId = captureException(err);

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(eventId).toBeUndefined();
    });

    it("captures caught HTTP errors at 500 and above", () => {
      const err = Object.assign(new Error("server failed"), { status: 503 });

      captureException(err);

      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it("forwards a string error to Sentry.captureException", () => {
      captureException("string error");
      expect(Sentry.captureException).toHaveBeenCalledWith("string error");
    });

    it("forwards null to Sentry.captureException", () => {
      captureException(null);
      expect(Sentry.captureException).toHaveBeenCalledWith(null);
    });

    it("forwards undefined to Sentry.captureException", () => {
      captureException(undefined);
      expect(Sentry.captureException).toHaveBeenCalledWith(undefined);
    });
  });

  describe("captureHttpError", () => {
    it("captures 5xx statuses", () => {
      const eventId = captureHttpError(503, { tags: { source: "subscribe" } });
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      expect(eventId).toBe("event-web-123");
    });

    it("skips expected 4xx statuses", () => {
      const eventId = captureHttpError(409);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(eventId).toBeUndefined();
    });

    it("classifies reportable statuses", () => {
      expect(shouldCaptureStatus(500)).toBe(true);
      expect(shouldCaptureStatus(422)).toBe(false);
      expect(
        shouldCaptureError(Object.assign(new Error("bad"), { status: 400 })),
      ).toBe(false);
      expect(shouldCaptureError(new Error("boom"))).toBe(true);
    });
  });

  describe("formatUserError", () => {
    it("appends a tracking ID to a helpful message", () => {
      expect(
        formatUserError("We could not save your request.", "event-web-123"),
      ).toBe("We could not save your request. Tracking ID: event-web-123");
    });

    it("leaves the message unchanged without a tracking ID", () => {
      expect(formatUserError("Please check your email and try again.")).toBe(
        "Please check your email and try again.",
      );
    });
  });

  describe("reportUserFacingError", () => {
    it("reports unexpected errors and returns fallback copy with tracking ID", () => {
      const message = reportUserFacingError(
        new Error("widget failed"),
        "We could not submit the form.",
        { tags: { source: "lead-form" } },
      );

      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      expect(message).toBe(
        "We could not submit the form. Tracking ID: event-web-123",
      );
    });

    it("uses an existing API tracking ID without duplicate client capture", () => {
      const message = reportUserFacingError(
        Object.assign(new Error("server failed"), {
          status: 500,
          trackingId: "event-api-999",
        }),
        "We could not submit the form.",
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(message).toBe(
        "We could not submit the form. Tracking ID: event-api-999",
      );
    });

    it("falls back to the client event ID when API tracking ID is blank", () => {
      const message = reportUserFacingError(
        Object.assign(new Error("server failed"), {
          status: 500,
          trackingId: "",
        }),
        "We could not submit the form.",
      );

      expect(message).toBe(
        "We could not submit the form. Tracking ID: event-web-123",
      );
    });

    it("returns expected 4xx messages without reporting them", () => {
      const message = reportUserFacingError(
        Object.assign(new Error("Please enter a valid email."), {
          status: 400,
        }),
        "We could not submit the form.",
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(message).toBe("Please enter a valid email.");
    });
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { siteConfig } from "../config/site";

describe("production QA source checks", () => {
  it("keeps the documented PostHog host compatible with the marketing CSP", () => {
    const envExample = readFileSync(
      resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    const headers = readFileSync(resolve(process.cwd(), "public/_headers"), {
      encoding: "utf8",
    });

    expect(envExample).toContain(
      "PUBLIC_POSTHOG_HOST=https://us.i.posthog.com",
    );
    expect(headers).toContain("https://us-assets.i.posthog.com");
    // The shared AI-SDR widget bundle is hosted on the ventora-ai-sdr-worker
    // origin, so script-src must allow it. The BFF stays same-origin, so
    // connect-src does NOT need the worker.
    const scriptSrc =
      headers.split("script-src")[1]?.split(";")[0]?.trim() ?? "";
    const connectSrc =
      headers.split("connect-src")[1]?.split(";")[0]?.trim() ?? "";
    expect(scriptSrc).toContain(
      "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev",
    );
    expect(connectSrc).not.toContain(
      "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev",
    );
    expect(headers).not.toContain("https://widgets.ventoralabs.com");
    expect(headers).not.toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://us-assets.i.posthog.com https://app.posthog.com",
    );
  });

  it("defines the legal entity used by legal pages", () => {
    expect(siteConfig.legalEntity).toBe("Angel Campa");
  });
});

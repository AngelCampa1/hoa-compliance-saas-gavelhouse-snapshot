import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PostHog CSP sources", () => {
  it("allows the supported PostHog ingest and asset hosts", () => {
    const headers = readFileSync(
      resolve(process.cwd(), "public/_headers"),
      "utf8",
    );

    expect(headers).toContain("https://eu.i.posthog.com");
    expect(headers).toContain("https://eu-assets.i.posthog.com");
  });
});

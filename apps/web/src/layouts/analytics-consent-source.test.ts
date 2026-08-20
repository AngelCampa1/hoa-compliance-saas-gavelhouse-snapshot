import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("base layout analytics consent", () => {
  it("does not render a PostHog cookie notice or consent gate", () => {
    const source = readFileSync(join(__dirname, "base-layout.astro"), "utf8");

    expect(source).not.toContain("CookieNotice");
    expect(source).not.toContain("cookie-notice.astro");
  });
});

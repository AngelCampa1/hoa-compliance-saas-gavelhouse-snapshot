import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();

describe("build commit marker", () => {
  it("renders a build-commit meta tag placeholder in index.html", () => {
    const html = readFileSync(path.join(appRoot, "index.html"), "utf8");
    expect(html).toContain('<meta name="build-commit"');
    expect(html).toContain("%VITE_BUILD_COMMIT%");
  });

  it("vite.config wires a transformIndexHtml plugin for the placeholder", () => {
    const config = readFileSync(path.join(appRoot, "vite.config.ts"), "utf8");
    expect(config).toContain("VITE_BUILD_COMMIT");
    expect(config).toContain("transformIndexHtml");
    expect(config).toContain("buildCommitHtmlPlugin");
  });

  it("replaces the placeholder with the resolved commit at build time", () => {
    const html = '<meta name="build-commit" content="%VITE_BUILD_COMMIT%" />';
    const transformed = html.replaceAll("%VITE_BUILD_COMMIT%", "abc1234");
    expect(transformed).toContain('content="abc1234"');
    expect(transformed).not.toContain("%VITE_BUILD_COMMIT%");
  });
});

describe("dashboard SEO boundaries", () => {
  it("marks the dashboard SPA shell as noindex", () => {
    const html = readFileSync(path.join(appRoot, "index.html"), "utf8");

    expect(html).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
  });

  it("sends an X-Robots-Tag noindex header for dashboard routes", () => {
    const headers = readFileSync(
      path.join(appRoot, "public", "_headers"),
      "utf8",
    );

    expect(headers).toContain("X-Robots-Tag: noindex, nofollow");
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("base layout source regressions", () => {
  it("does not hardcode a global apple touch icon path", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("appleTouchIcon");
    expect(source).not.toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
  });

  it("threads the optional appleTouchIcon prop from the shared site config", () => {
    const typesSource = readSource("../lib/types.ts");

    expect(typesSource).toContain("appleTouchIcon?: string;");
  });

  it("supports site-level metadata preservation without changing the global default", () => {
    const layoutSource = readSource("./base-layout.astro");
    const typesSource = readSource("../lib/types.ts");

    expect(layoutSource).toContain("preserveMetaTagCopy?: boolean");
    expect(layoutSource).toContain(
      "preserveAuthoredMetadata={preserveMetaTagCopy}",
    );
    expect(typesSource).toContain("preserveMetaTagCopy?: boolean;");
  });

  it("renders the build-commit meta tag from PUBLIC_BUILD_COMMIT", () => {
    const source = readSource("./base-layout.astro");
    expect(source).toContain('name="build-commit"');
    expect(source).toContain("import.meta.env.PUBLIC_BUILD_COMMIT");
  });

  it("initializes Sentry independently from analytics consent gates", () => {
    const source = readSource("./base-layout.astro");
    const sentryImportIndex = source.indexOf("import {initSentry}");
    const sentryGateStart = source.lastIndexOf("{", sentryImportIndex);
    const sentrySnippet = source.slice(sentryGateStart, sentryImportIndex);

    expect(sentryImportIndex).toBeGreaterThan(-1);
    expect(sentrySnippet).toContain("import.meta.env.PROD");
    expect(sentrySnippet).not.toContain("analyticsEnabled");
  });

  it("does not install the Ventora feedback widget on public marketing pages", () => {
    const source = readSource("./base-layout.astro");

    expect(source).not.toContain("widgets.ventoralabs.com/w/v1.js");
    expect(source).not.toContain('data-product="gavelhouse"');
    expect(source).not.toContain('data-widget="feedback-button"');
  });
});

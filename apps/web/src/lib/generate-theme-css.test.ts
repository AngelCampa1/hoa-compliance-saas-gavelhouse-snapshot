import { describe, expect, it } from "vitest";
import { generateScale, generateThemeCSS } from "./generate-theme-css.js";
import type { SiteConfig } from "./types";

type Theme = SiteConfig["theme"];

const baseTheme: Theme = {
  primary: "#0ea5e9",
  accent: "#f97316",
  fonts: { heading: "Inter", body: "Inter" },
};

const themeWithSurface: Theme = {
  primary: "#4a7c59",
  accent: "#c17b84",
  surface: "#fdf8f3",
  text: "#2d2a27",
  muted: "#9a9088",
  fonts: { heading: "Inter", body: "Inter" },
};

describe("generateThemeCSS", () => {
  it("emits a single :root block", () => {
    const css = generateThemeCSS(baseTheme);

    expect(css).toContain(":root {");
    expect(css).toContain("--site-primary: #0ea5e9;");
    expect(css).toContain("--site-accent: #f97316;");
    expect(css).not.toContain("@media");
    expect(css).not.toContain(":root:not(");
  });

  it("uses provided surface, text, and muted values", () => {
    const css = generateThemeCSS(themeWithSurface);

    expect(css).toContain("--site-surface: #fdf8f3;");
    expect(css).toContain("--site-text: #2d2a27;");
    expect(css).toContain("--site-muted: #9a9088;");
  });

  it("emits primary, accent, neutral, success, and error scales", () => {
    const css = generateThemeCSS(baseTheme);

    for (const scale of ["primary", "accent", "neutral", "success", "error"]) {
      expect(css).toContain(`--color-${scale}-50:`);
      expect(css).toContain(`--color-${scale}-950:`);
    }
  });

  it("accepts valid category color overrides", () => {
    const css = generateThemeCSS({
      ...baseTheme,
      categoryColors: { feature: { iconColor: "oklch(0.5 0.2 240)" } },
    });

    expect(css).toContain("--site-category-feature: oklch(0.5 0.2 240);");
  });
});

describe("pill-button radius rule", () => {
  it("all ctaStyle presets emit pill radius (9999px) for primary button", () => {
    const ctaStyles = ["solid", "soft", "outline"] as const;

    for (const ctaStyle of ctaStyles) {
      const css = generateThemeCSS({ ...baseTheme, ctaStyle });
      expect(css, `ctaStyle="${ctaStyle}" must emit pill radius`).toContain(
        "--site-primary-button-radius: 9999px;",
      );
    }
  });

  it("default ctaStyle (solid) emits pill radius without explicit override", () => {
    const css = generateThemeCSS(baseTheme);
    expect(css).toContain("--site-primary-button-radius: 9999px;");
  });
});

describe("generateScale", () => {
  it("generates all expected scale steps", () => {
    const scale = generateScale("#0ea5e9");

    expect(Object.keys(scale)).toEqual([
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ]);
  });
});

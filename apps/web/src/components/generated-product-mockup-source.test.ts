import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("generated product mockup integration", () => {
  it("keeps the homepage hero on the reusable generated mockup component", () => {
    const source = readSource("components/home/home-hero.astro");

    expect(source).toContain("GeneratedProductMockup");
    expect(source).toContain("resolveProductVisualPreset");
  });

  it("passes generated visual presets into article detail pages", () => {
    expect(readSource("pages/product/[slug].astro")).toContain(
      "productVisual={productVisual}",
    );
    expect(readSource("pages/solutions/[slug].astro")).toContain(
      "productVisual={productVisual}",
    );
  });

  it("passes generated visual presets into comparison detail templates", () => {
    expect(readSource("pages/compare/alternatives/[slug].astro")).toContain(
      "productVisual={productVisual}",
    );
    expect(
      readSource("pages/compare/versus/[slugA]-vs-[slugB].astro"),
    ).toContain("productVisual={productVisual}");
    expect(readSource("pages/compare/pricing/[slug].astro")).toContain(
      "productVisual={productVisual}",
    );
  });
});

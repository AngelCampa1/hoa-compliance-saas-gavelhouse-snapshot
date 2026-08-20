import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { knowledgeBase } from "@boardstack/shared";
import { describe, expect, it } from "vitest";

function readPricingSource(): string {
  return readFileSync(resolve(process.cwd(), "src/pages/pricing.astro"), {
    encoding: "utf8",
  });
}

describe("pricing page source", () => {
  it("does not derive tier capabilities from row indexes", () => {
    const source = readPricingSource();

    expect(source).not.toMatch(/rows\.map\(\(row,\s*index\)/);
    expect(source).not.toMatch(/index\s*<\s*\d+/);
  });

  it("renders capability availability from shared pricing plan features", () => {
    const source = readPricingSource();

    expect(source).toContain("getPricingFeatureRowsWithAvailability");
    expect(source).toContain("featureAvailability");
    expect(source).not.toMatch(/FEATURE_AVAILABILITY_BY_ROW/);
    expect(source).not.toMatch(/Owner portal["']\s*:\s*\[/);
    expect(source).not.toMatch(/Enterprise SLA["']\s*:\s*\[/);
    expect(knowledgeBase.marketing.pricing.featureAvailability.length).toBe(
      knowledgeBase.marketing.pricing.featureRows.length,
    );
  });

  it("keeps Portfolio out of the main priced card path", () => {
    const source = readPricingSource();
    const pricedPlanIds = knowledgeBase.marketing.pricing.plans.map(
      (plan) => plan.id,
    );

    expect(pricedPlanIds).toEqual(["starter", "growth", "scale"]);
    expect(source).toContain("customOption");
    expect(source).toContain("tiers.map");
    expect(source).not.toContain('"portfolio",');
  });
});

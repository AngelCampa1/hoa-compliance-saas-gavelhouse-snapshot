import { describe, expect, it } from "vitest";
import {
  resolveCompareProductVisualPreset,
  resolveProductVisualPreset,
  resolveSolutionVisualPreset,
} from "./generated-product-visuals";

describe("generated product visual presets", () => {
  it("maps reserve product pages to reserve compliance visuals", () => {
    expect(
      resolveProductVisualPreset({
        slug: "hoa-reserve-fund-compliance-software",
        productCategory: "Reserve compliance",
      }).variant,
    ).toBe("reserve-compliance");
  });

  it("maps fund accounting product pages to fund accounting visuals", () => {
    expect(
      resolveProductVisualPreset({
        slug: "hoa-fund-accounting-software",
        productCategory: "Fund accounting",
      }).variant,
    ).toBe("fund-accounting");
  });

  it("uses related product slugs to choose solution visuals", () => {
    expect(
      resolveSolutionVisualPreset({
        relatedProductSlugs: ["hoa-owner-portal-software"],
        solutionCategory: "segment",
      }).variant,
    ).toBe("owner-portal");
  });

  it("uses pricing visuals for pricing comparison contexts", () => {
    expect(
      resolveCompareProductVisualPreset({
        type: "pricing",
        competitorName: "PayHOA",
        competitorPricing: "$49/mo + per-unit fees",
      }).variant,
    ).toBe("pricing-comparison");
  });

  it("uses the default pricing caption when no competitor is provided", () => {
    expect(
      resolveCompareProductVisualPreset({
        type: "pricing",
      }).caption,
    ).toBe(
      "Compare Gavelhouse flat pricing against per-door platforms, setup fees, and software stacks built for property managers.",
    );
  });

  it("adds competitor-specific captions to alternative visuals", () => {
    expect(
      resolveCompareProductVisualPreset({
        type: "alternative",
        competitorName: "PayHOA",
        competitorPricing: "$49/mo + per-unit fees",
      }).caption,
    ).toContain("PayHOA");
  });

  it("keeps head-to-head comparison contexts on board record visuals", () => {
    expect(
      resolveCompareProductVisualPreset({
        type: "versus",
        competitorName: "PayHOA and Gavelhouse",
      }).variant,
    ).toBe("board-record");
  });

  it("uses pricing visuals for the comparison hub", () => {
    expect(
      resolveCompareProductVisualPreset({
        type: "hub",
      }).variant,
    ).toBe("pricing-comparison");
  });

  it("maps governance product pages to governance visuals", () => {
    expect(
      resolveProductVisualPreset({
        slug: "hoa-governance-workflow-software",
        productCategory: "Governance workflows",
      }).variant,
    ).toBe("governance");
  });

  it("maps website product pages to owner portal visuals", () => {
    expect(
      resolveProductVisualPreset({
        slug: "hoa-website-software",
        productCategory: "Homeowner Portal and Website",
      }).variant,
    ).toBe("owner-portal");
  });

  it("falls back to board record visuals for unknown contexts", () => {
    expect(
      resolveProductVisualPreset({
        slug: "unknown",
        productCategory: "Unknown",
      }).variant,
    ).toBe("board-record");
  });
});

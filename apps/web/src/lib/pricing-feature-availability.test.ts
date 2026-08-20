import { knowledgeBase } from "@boardstack/shared";
import { describe, expect, it } from "vitest";
import {
  getPricingFeatureAvailability,
  getPricingFeatureRowsWithAvailability,
} from "./pricing-feature-availability";

describe("pricing feature availability", () => {
  it("uses shared pricing rows and plan ids for the comparison matrix", () => {
    const rows = getPricingFeatureRowsWithAvailability();
    const planIds = knowledgeBase.marketing.pricing.plans.map(
      (plan) => plan.id,
    );

    expect(rows.map((row) => row.label)).toEqual(
      knowledgeBase.marketing.pricing.featureRows,
    );
    expect(Object.keys(rows[0].featureAvailability)).toEqual(planIds);
  });

  it("reads each row availability from shared pricing knowledge", () => {
    const rows = getPricingFeatureRowsWithAvailability();

    expect(rows).toEqual(
      knowledgeBase.marketing.pricing.featureAvailability.map((row) => ({
        label: row.label,
        featureAvailability: row.availability,
      })),
    );
  });

  it("keeps owner portal out of Starter while including Growth and Scale", () => {
    expect(getPricingFeatureAvailability("Owner portal")).toEqual({
      starter: false,
      growth: true,
      scale: true,
    });
  });

  it("keeps Scale-only capabilities out of Starter and Growth", () => {
    expect(getPricingFeatureAvailability("Audit packet exports")).toEqual({
      starter: false,
      growth: false,
      scale: true,
    });
  });

  it("keeps removed Portfolio-only rows out of the matrix", () => {
    expect(() => getPricingFeatureAvailability("Enterprise SLA")).toThrow(
      "Missing pricing feature availability: Enterprise SLA",
    );
  });

  it("fails fast when a feature row has no shared availability mapping", () => {
    expect(() => getPricingFeatureAvailability("Unlisted capability")).toThrow(
      "Missing pricing feature availability: Unlisted capability",
    );
  });
});

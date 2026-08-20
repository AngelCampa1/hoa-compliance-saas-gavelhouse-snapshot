import { describe, expect, it } from "vitest";

import {
  findPricingIntentTierFromSearch,
  getPricingIntentTierFromHref,
} from "./pricing-intent";

const tiers = [{ name: "Starter" }, { name: "Center" }, { name: "Enterprise" }];

describe("pricing-intent", () => {
  describe("getPricingIntentTierFromHref", () => {
    it("returns the plan query param when present", () => {
      expect(getPricingIntentTierFromHref("/?plan=center#pricing")).toBe(
        "center",
      );
    });

    it("returns undefined when the href has no plan query param", () => {
      expect(getPricingIntentTierFromHref("/#pricing")).toBeUndefined();
    });

    it("returns undefined when the plan param is empty or whitespace-only", () => {
      expect(getPricingIntentTierFromHref("/?plan=")).toBeUndefined();
      expect(getPricingIntentTierFromHref("/?plan=%20%20")).toBeUndefined();
    });

    it("supports absolute urls", () => {
      expect(
        getPricingIntentTierFromHref(
          "https://gavelhouse.app/?plan=enterprise#pricing",
        ),
      ).toBe("enterprise");
    });
  });

  describe("findPricingIntentTierFromSearch", () => {
    it("matches tier names case-insensitively from the search string", () => {
      expect(findPricingIntentTierFromSearch("?plan=center", tiers)).toBe(
        "Center",
      );
    });

    it("returns undefined when the plan param does not match any tier", () => {
      expect(
        findPricingIntentTierFromSearch("?plan=unknown", tiers),
      ).toBeUndefined();
    });

    it("returns undefined when the search string has no plan param", () => {
      expect(findPricingIntentTierFromSearch("", tiers)).toBeUndefined();
    });

    it("returns undefined when the plan param is empty or whitespace-only", () => {
      expect(findPricingIntentTierFromSearch("?plan=", tiers)).toBeUndefined();
      expect(
        findPricingIntentTierFromSearch("?plan=%20%20", tiers),
      ).toBeUndefined();
    });

    it("accepts a search string without a leading question mark", () => {
      expect(findPricingIntentTierFromSearch("plan=center", tiers)).toBe(
        "Center",
      );
    });
  });
});

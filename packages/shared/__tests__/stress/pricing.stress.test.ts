/**
 * Stress / property-based tests for packages/shared/src/pricing.ts
 *
 * Uses a seeded deterministic PRNG (mulberry32) — no extra npm deps.
 * Genuine source bugs are marked it.fails / it.skip with a "// BUG:" comment.
 */

import { describe, expect, it } from "vitest";
import {
  PRICING_PLANS,
  formatCurrencyCents,
  getDiscountedDisplayPrice,
  getDiscountedDisplayPriceRange,
  getOriginalDisplayPrice,
  getLimitedOfferAnnualTotalCents,
  getPricingPlan,
  stripMonthlyPriceSuffix,
  LIMITED_SUBSCRIPTION_PROMO,
} from "../../src/pricing.js";
import type { Tier } from "../../src/billing/tiers.js";

// ── seeded PRNG ──────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Only tiers that have a pricing plan entry (portfolio is custom/enterprise)
const PRICED_TIERS: Tier[] = ["starter", "growth", "scale"];
const CYCLES = ["monthly", "annual"] as const;

// ── helpers ──────────────────────────────────────────────────────────────────
function isValidPriceString(s: string): boolean {
  // must match $<digits>/mo or $<digits>.<digits>/mo
  return /^\$\d+(\.\d+)?\/mo$/.test(s);
}

// ── formatCurrencyCents ──────────────────────────────────────────────────────
describe("formatCurrencyCents — fuzz", () => {
  const rng = mulberry32(0xdeadbeef);

  it("never produces NaN or $NaN for any integer input in [0, 2^31)", () => {
    for (let i = 0; i < 5000; i++) {
      const cents = Math.floor(rng() * 2_147_483_648);
      const result = formatCurrencyCents(cents);
      expect(result).not.toContain("NaN");
      expect(result).not.toContain("undefined");
      expect(result).toMatch(/^\$/);
    }
  });

  it("never throws on finite non-integer / boundary inputs", () => {
    const inputs = [
      0,
      -1,
      -100,
      -1_000_000,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
      0.5,
      1.99,
      99.999,
    ];
    for (const v of inputs) {
      // must not throw for finite values; result may be unusual for negatives/floats
      expect(() => formatCurrencyCents(v)).not.toThrow();
    }
  });

  it("throws for NaN input (non-finite guard)", () => {
    expect(() => formatCurrencyCents(NaN)).toThrow(
      "formatCurrencyCents requires a finite number",
    );
  });

  it("throws for Infinity input (non-finite guard)", () => {
    expect(() => formatCurrencyCents(Infinity)).toThrow(
      "formatCurrencyCents requires a finite number",
    );
  });

  it("throws for -Infinity input (non-finite guard)", () => {
    expect(() => formatCurrencyCents(-Infinity)).toThrow(
      "formatCurrencyCents requires a finite number",
    );
  });
});

// ── getPricingPlan ────────────────────────────────────────────────────────────
describe("getPricingPlan — fuzz", () => {
  // INTENDED: portfolio is a contact-sales tier with no self-serve price entry.
  // getPricingPlan is a helper for marketing/checkout surfaces that only handle
  // starter/growth/scale. Throwing for "portfolio" is a documented guard —
  // callers must exclude portfolio before calling this function.
  it("getPricingPlan throws for portfolio (contact-sales tier, no self-serve price — intended)", () => {
    expect(() => getPricingPlan("portfolio")).toThrow();
  });

  it("getPricingPlan returns a plan for every self-serve tier", () => {
    for (const tier of PRICED_TIERS) {
      expect(() => getPricingPlan(tier)).not.toThrow();
      const plan = getPricingPlan(tier);
      expect(plan.slug).toBe(tier);
    }
  });

  it("returns a plan for every self-serve tier (portfolio excluded)", () => {
    for (const tier of PRICED_TIERS) {
      const plan = getPricingPlan(tier);
      expect(plan.slug).toBe(tier);
      expect(plan.monthlyPriceCents).toBeGreaterThan(0);
      expect(plan.annualTotalPriceCents).toBeGreaterThan(0);
    }
  });

  it("throws for invalid tier slugs", () => {
    const invalid = [
      "free",
      "enterprise",
      "",
      "STARTER",
      "Starter",
      " starter",
      "starter ",
      "null",
      "undefined",
      "\x00",
    ];
    for (const slug of invalid) {
      expect(() => getPricingPlan(slug as Tier)).toThrow();
    }
  });
});

// ── plan price ordering ───────────────────────────────────────────────────────
describe("PRICING_PLANS — monotonic ordering invariant", () => {
  it("monthly prices are non-decreasing: starter ≤ growth ≤ scale", () => {
    const selfServe = PRICING_PLANS.filter((p) =>
      ["starter", "growth", "scale"].includes(p.slug),
    );
    for (let i = 1; i < selfServe.length; i++) {
      expect(selfServe[i]!.monthlyPriceCents).toBeGreaterThanOrEqual(
        selfServe[i - 1]!.monthlyPriceCents,
      );
    }
  });

  it("annual total prices are non-decreasing", () => {
    const selfServe = PRICING_PLANS.filter((p) =>
      ["starter", "growth", "scale"].includes(p.slug),
    );
    for (let i = 1; i < selfServe.length; i++) {
      expect(selfServe[i]!.annualTotalPriceCents).toBeGreaterThanOrEqual(
        selfServe[i - 1]!.annualTotalPriceCents,
      );
    }
  });

  it("annualMonthlyDisplayPriceCents < monthlyPriceCents for every self-serve tier (annual is cheaper)", () => {
    const selfServe = PRICING_PLANS.filter((p) =>
      ["starter", "growth", "scale"].includes(p.slug),
    );
    for (const plan of selfServe) {
      expect(plan.annualMonthlyDisplayPriceCents).toBeLessThan(
        plan.monthlyPriceCents,
      );
    }
  });
});

// ── getDiscountedDisplayPrice ─────────────────────────────────────────────────
describe("getDiscountedDisplayPrice — fuzz", () => {
  it("always returns a string matching $X/mo pattern for valid tiers+cycles", () => {
    for (const tier of PRICED_TIERS) {
      for (const cycle of CYCLES) {
        const result = getDiscountedDisplayPrice(tier, cycle);
        expect(isValidPriceString(result)).toBe(true);
      }
    }
  });

  it("discounted price numeric value ≤ original price for percentOff ∈ [0,100]", () => {
    const rng = mulberry32(0xc0ffee);
    for (const tier of ["starter", "growth", "scale"] as Tier[]) {
      for (const cycle of CYCLES) {
        for (let i = 0; i < 200; i++) {
          const percentOff = Math.floor(rng() * 101); // [0..100]
          const original = getOriginalDisplayPrice(tier, cycle);
          const discounted = getDiscountedDisplayPrice(tier, cycle, percentOff);

          const origVal = parseFloat(original.replace(/[^0-9.]/g, ""));
          const discVal = parseFloat(discounted.replace(/[^0-9.]/g, ""));
          expect(discVal).toBeLessThanOrEqual(origVal + 0.01); // +0.01 for rounding
        }
      }
    }
  });

  // NOTE: percentOff=0 equals original price for current plans because all
  // cent values are multiples of 100. However getDiscountedDisplayPrice uses
  // Math.ceil internally (roundUp=true) while getOriginalDisplayPrice does not,
  // so this invariant would break for any plan with non-round cent values.
  // Documenting the contract: for current data they are equal.
  it("getDiscountedDisplayPrice with percentOff=0 equals getOriginalDisplayPrice (current plans have round cent values)", () => {
    for (const tier of ["starter", "growth", "scale"] as Tier[]) {
      for (const cycle of CYCLES) {
        const original = getOriginalDisplayPrice(tier, cycle);
        const discounted = getDiscountedDisplayPrice(tier, cycle, 0);
        expect(discounted).toBe(original);
      }
    }
  });

  it("percentOff=100 always yields $0/mo", () => {
    for (const tier of ["starter", "growth", "scale"] as Tier[]) {
      for (const cycle of CYCLES) {
        const result = getDiscountedDisplayPrice(tier, cycle, 100);
        const val = parseFloat(result.replace(/[^0-9.]/g, ""));
        expect(val).toBe(0);
      }
    }
  });
});

// ── getDiscountedDisplayPriceRange ────────────────────────────────────────────
describe("getDiscountedDisplayPriceRange — fuzz", () => {
  it("throws on empty slugs array", () => {
    expect(() => getDiscountedDisplayPriceRange([], "monthly")).toThrow();
  });

  it("single-slug range equals the plain discounted price", () => {
    for (const tier of ["starter", "growth", "scale"] as Tier[]) {
      for (const cycle of CYCLES) {
        const range = getDiscountedDisplayPriceRange([tier], cycle);
        const single = getDiscountedDisplayPrice(tier, cycle);
        expect(range).toBe(single);
      }
    }
  });

  it("multi-slug range contains a dash separator", () => {
    const range = getDiscountedDisplayPriceRange(
      ["starter", "scale"],
      "annual",
    );
    expect(range).toContain("-");
  });

  it("multi-slug range: last segment ends with /mo", () => {
    const range = getDiscountedDisplayPriceRange(
      ["starter", "growth", "scale"],
      "monthly",
    );
    expect(range).toMatch(/\/mo$/);
  });
});

// ── stripMonthlyPriceSuffix ───────────────────────────────────────────────────
describe("stripMonthlyPriceSuffix — fuzz", () => {
  const rng = mulberry32(0xfade);

  it("removes trailing /mo", () => {
    expect(stripMonthlyPriceSuffix("$10/mo")).toBe("$10");
    expect(stripMonthlyPriceSuffix("$10.50/mo")).toBe("$10.50");
  });

  it("does not mutate strings without /mo suffix", () => {
    const inputs = ["$10", "$10/yr", "$10/month", "", "abc", "/mo"];
    for (const s of inputs) {
      // only trailing /mo is stripped
      if (!s.endsWith("/mo")) {
        expect(stripMonthlyPriceSuffix(s)).toBe(s);
      }
    }
  });

  it("idempotent: stripping twice equals stripping once", () => {
    const samples = ["$10/mo", "$0/mo", "$9999.99/mo", "no suffix", ""];
    for (const s of samples) {
      expect(stripMonthlyPriceSuffix(stripMonthlyPriceSuffix(s))).toBe(
        stripMonthlyPriceSuffix(s),
      );
    }
  });

  it("never throws on 5000 random strings", () => {
    const chars = "abcdefghijklmnopqrstuvwxyz$0123456789/mo\x00￿";
    for (let i = 0; i < 5000; i++) {
      const len = Math.floor(rng() * 30);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += chars[Math.floor(rng() * chars.length)];
      }
      expect(() => stripMonthlyPriceSuffix(s)).not.toThrow();
    }
  });
});

// ── getLimitedOfferAnnualTotalCents ───────────────────────────────────────────
describe("getLimitedOfferAnnualTotalCents — fuzz", () => {
  const percentOff = LIMITED_SUBSCRIPTION_PROMO.percentOff;

  it("result ≤ input for all positive inputs (discount never increases price)", () => {
    const rng = mulberry32(0xabcd1234);
    for (let i = 0; i < 5000; i++) {
      const cents = Math.floor(rng() * 10_000_000);
      const result = getLimitedOfferAnnualTotalCents(cents);
      expect(result).toBeLessThanOrEqual(cents);
    }
  });

  it("result is always a multiple of 100 (rounds to whole dollar)", () => {
    const rng = mulberry32(0x1337);
    for (let i = 0; i < 5000; i++) {
      const cents = Math.floor(rng() * 10_000_000);
      const result = getLimitedOfferAnnualTotalCents(cents);
      expect(result % 100).toBe(0);
    }
  });

  it("result ≥ 0 for non-negative input", () => {
    const rng = mulberry32(0x9999);
    for (let i = 0; i < 2000; i++) {
      const cents = Math.floor(rng() * 10_000_000);
      expect(getLimitedOfferAnnualTotalCents(cents)).toBeGreaterThanOrEqual(0);
    }
  });

  it("result is approximately (1 - percentOff/100) * input, within 1 dollar", () => {
    const rng = mulberry32(0x5678);
    const factor = (100 - percentOff) / 100;
    for (let i = 0; i < 2000; i++) {
      const cents = Math.floor(rng() * 10_000_000);
      const expected = cents * factor;
      const result = getLimitedOfferAnnualTotalCents(cents);
      expect(result).toBeGreaterThanOrEqual(expected - 100);
      expect(result).toBeLessThanOrEqual(expected + 100);
    }
  });
});

import { describe, expect, it } from "vitest";
// @ts-expect-error Node types are not part of the shared package build.
import { readFileSync } from "node:fs";
import {
  appHelpKnowledgeJsonSchema,
  buildAppHelpKnowledgeJson,
  buildFullKnowledgeJson,
  buildMarketingKnowledgeJson,
  formatKnowledgeDiscountedDisplayPrice,
  formatKnowledgeDiscountedDisplayPriceRange,
  formatKnowledgeOriginalDisplayPrice,
  fullKnowledgeJsonSchema,
  getKnowledgeSafetyViolations,
  KNOWLEDGE_BRAND,
  KNOWLEDGE_GUARANTEE_CONFIG,
  KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO,
  KNOWLEDGE_PRICING_PLANS,
  knowledgeBase,
  marketingKnowledgeJsonSchema,
} from "../src/knowledge/index.js";
import { PRICING_TIERS } from "../src/brand.js";
import appHelpJson from "../generated/knowledge/app-help.json";
import fullJson from "../generated/knowledge/full.json";
import marketingJson from "../generated/knowledge/marketing.json";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("knowledge source of truth", () => {
  it("keeps the KB as the root source instead of importing compatibility adapters", () => {
    const knowledgeSource = readSource("../src/knowledge/index.ts");
    const brandSource = readSource("../src/brand.ts");
    const pricingSource = readSource("../src/pricing.ts");
    const productHelpSource = readSource("../src/product-help.ts");

    expect(knowledgeSource).not.toMatch(/from "\.\.\/brand\.js"/);
    expect(knowledgeSource).not.toMatch(/from "\.\.\/pricing\.js"/);
    expect(knowledgeSource).not.toMatch(/from "\.\.\/product-help\.js"/);

    expect(brandSource).toContain("./knowledge/index.js");
    expect(pricingSource).toContain("./knowledge/index.js");
    expect(productHelpSource).toContain("./knowledge/index.js");
  });

  it("publishes schema-versioned marketing, app-help, and full JSON artifacts", () => {
    expect(marketingKnowledgeJsonSchema.parse(marketingJson)).toEqual(
      marketingJson,
    );
    expect(appHelpKnowledgeJsonSchema.parse(appHelpJson)).toEqual(appHelpJson);
    expect(fullKnowledgeJsonSchema.parse(fullJson)).toEqual(fullJson);

    expect(marketingJson.schemaVersion).toBe(knowledgeBase.schemaVersion);
    expect(appHelpJson.schemaVersion).toBe(knowledgeBase.schemaVersion);
    expect(fullJson.domains.marketing.schemaVersion).toBe(
      knowledgeBase.schemaVersion,
    );
    expect(fullJson.domains.app.schemaVersion).toBe(
      knowledgeBase.schemaVersion,
    );
  });

  it("keeps generated marketing JSON in lockstep with every marketing KB ID", () => {
    expect(marketingJson.domain).toBe("marketing");
    expect(marketingJson.product.id).toBe(knowledgeBase.marketing.product.id);
    expect(marketingJson.offer.id).toBe(knowledgeBase.marketing.offer.id);
    expect(marketingJson.pricing.plans.map((plan) => plan.id)).toEqual(
      knowledgeBase.marketing.pricing.plans.map((plan) => plan.id),
    );
    expect(marketingJson.faqs.map((faq) => faq.id)).toEqual(
      knowledgeBase.marketing.faqs.map((faq) => faq.id),
    );
    expect(
      marketingJson.competitors.map((competitor) => competitor.id),
    ).toEqual(
      knowledgeBase.marketing.competitors.map((competitor) => competitor.id),
    );
    expect(
      marketingJson.capabilities.map((capability) => capability.id),
    ).toEqual(
      knowledgeBase.marketing.capabilities.map((capability) => capability.id),
    );
  });

  it("keeps generated app-help JSON in lockstep with topics, routes, fields, and glossary terms", () => {
    expect(appHelpJson.domain).toBe("app");
    expect(appHelpJson.help.version).toBe(knowledgeBase.app.help.version);
    expect(appHelpJson.help.topics.map((topic) => topic.id)).toEqual(
      knowledgeBase.app.help.topics.map((topic) => topic.id),
    );
    expect(appHelpJson.help.pageHelp.map((page) => page.id)).toEqual(
      knowledgeBase.app.help.pageHelp.map((page) => page.id),
    );
    expect(appHelpJson.help.fieldHelp.map((field) => field.id)).toEqual(
      knowledgeBase.app.help.fieldHelp.map((field) => field.id),
    );
    expect(appHelpJson.help.glossary.map((entry) => entry.id)).toEqual(
      knowledgeBase.app.help.glossary.map((entry) => entry.id),
    );
  });

  it("full JSON contains both domains without changing the generated domain payloads", () => {
    expect(fullJson.domains.marketing).toEqual(marketingJson);
    expect(fullJson.domains.app).toEqual(appHelpJson);
  });

  it("generated JSON is current relative to the TS KB", () => {
    expect(buildMarketingKnowledgeJson()).toEqual(marketingJson);
    expect(buildAppHelpKnowledgeJson()).toEqual(appHelpJson);
    expect(buildFullKnowledgeJson()).toEqual(fullJson);
  });

  it("formats original and rounded-up limited offer pricing for knowledge payloads", () => {
    expect(formatKnowledgeOriginalDisplayPrice("starter", "monthly")).toBe(
      "$59/mo",
    );
    expect(formatKnowledgeDiscountedDisplayPrice("starter", "monthly")).toBe(
      "$12/mo",
    );
    expect(formatKnowledgeDiscountedDisplayPrice("scale", "monthly", 30)).toBe(
      "$210/mo",
    );
    expect(
      formatKnowledgeDiscountedDisplayPriceRange(
        ["starter", "scale"],
        "annual",
      ),
    ).toBe("$10-$50/mo");
    expect(
      formatKnowledgeDiscountedDisplayPriceRange(["starter"], "annual"),
    ).toBe("$10/mo");
    expect(
      formatKnowledgeDiscountedDisplayPriceRange(
        ["starter", "scale"],
        "monthly",
        30,
      ),
    ).toBe("$42-$210/mo");
    expect(() =>
      formatKnowledgeDiscountedDisplayPriceRange([], "annual"),
    ).toThrow("Cannot format an empty pricing range");
  });

  it("fails fast when knowledge pricing references an unknown plan", () => {
    expect(() =>
      formatKnowledgeOriginalDisplayPrice("missing" as never, "monthly"),
    ).toThrow("Missing pricing plan: missing");
  });

  it("keeps KB and generated JSON public-safe for internal AI use", () => {
    expect(
      getKnowledgeSafetyViolations({
        appHelpJson,
        fullJson,
        exportedKnowledgeConstants: {
          KNOWLEDGE_BRAND,
          KNOWLEDGE_GUARANTEE_CONFIG,
          KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO,
          KNOWLEDGE_PRICING_PLANS,
        },
        knowledgeBase,
        marketingJson,
      }),
    ).toEqual([]);
  });

  it("reports unsafe keys and secret-looking values with paths", () => {
    expect(
      getKnowledgeSafetyViolations({
        public: "safe",
        nested: {
          apiToken: "redacted",
          value: "DATABASE_URL",
          keyName: "OPENAI_API_KEY",
        },
      }),
    ).toEqual([
      "nested.apiToken: unsafe key",
      "nested.value: unsafe value",
      "nested.keyName: unsafe value",
    ]);
  });

  it("reports private URLs and operational language with paths", () => {
    expect(
      getKnowledgeSafetyViolations({
        urls: [
          "http://localhost:3060",
          "https://staging-api.gavelhouse.app",
          "http://10.0.0.5/runbook",
          "http://[::1]:3060",
          "http://0.0.0.0:8060",
        ],
        copy: "Use the internal deployment runbook for QA credentials.",
      }),
    ).toEqual([
      "urls.0: unsafe value",
      "urls.1: unsafe value",
      "urls.2: unsafe value",
      "urls.3: unsafe value",
      "urls.4: unsafe value",
      "copy: unsafe value",
    ]);
  });

  it("each pricing plan has non-empty whoItsFor, outcome, and notIdealFor fields", () => {
    for (const plan of knowledgeBase.marketing.pricing.plans) {
      expect(plan.whoItsFor.length).toBeGreaterThan(0);
      expect(plan.outcome.length).toBeGreaterThan(0);
      expect(plan.notIdealFor.length).toBeGreaterThan(0);
    }
    for (const tier of PRICING_TIERS) {
      expect(tier.whoItsFor.length).toBeGreaterThan(0);
      expect(tier.outcome.length).toBeGreaterThan(0);
      expect(tier.notIdealFor.length).toBeGreaterThan(0);
    }
  });

  it("maps every shared pricing feature row to explicit plan availability", () => {
    const featureRows = knowledgeBase.marketing.pricing.featureRows;
    const availabilityRows =
      knowledgeBase.marketing.pricing.featureAvailability;
    const planIds = knowledgeBase.marketing.pricing.plans.map(
      (plan) => plan.id,
    );

    expect(availabilityRows.map((row) => row.label)).toEqual(featureRows);

    for (const row of availabilityRows) {
      expect(Object.keys(row.availability).sort()).toEqual([...planIds].sort());
      expect(Object.values(row.availability).every(Boolean)).toBe(
        row.label === "Reserve/operating fund separation" ||
          row.label === "State compliance tracking" ||
          row.label === "Dues ledger",
      );
    }
  });
});

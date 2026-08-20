import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  LEAD_MAGNET_SLUGS,
  getDiscountedDisplayPrice,
  knowledgeBase,
} from "@boardstack/shared";
import magnetConfigs, {
  getMagnetConfig,
  validateMagnetConfigRoutes,
} from "../../../src/emails/content/magnets.js";

function countWords(md: string): number {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown link URLs, keep link text
    .replace(/\*\*/g, "")
    .split(/\s+/u)
    .filter((w) => w.length > 0).length;
}

describe("magnet email content", () => {
  it("getMagnetConfig returns the config for a known slug", () => {
    const cfg = getMagnetConfig("reserve-fund-calculator");
    expect(cfg.slug).toBe("reserve-fund-calculator");
  });

  it("getMagnetConfig throws for unknown slug", () => {
    expect(() =>
      getMagnetConfig(
        "unknown-slug" as unknown as (typeof magnetConfigs)[number]["slug"],
      ),
    ).toThrow(/No magnet email config/);
  });

  it("covers every promoted lead magnet", () => {
    const slugs = magnetConfigs.map((m) => m.slug).sort();
    expect(slugs).toEqual([...LEAD_MAGNET_SLUGS].sort());
  });

  it("has exactly one entry per slug (no duplicates)", () => {
    const slugs = magnetConfigs.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("uses the Y80OFF first-year promo in nurture pricing copy", () => {
    const allCopy = magnetConfigs
      .flatMap((m) => [
        m.deliverySubject,
        m.deliveryPreheader,
        m.deliveryBodyMarkdown,
        ...m.steps.flatMap((s) => [
          s.subject,
          s.preheader,
          s.heading,
          s.bodyMarkdown,
          s.ctaLabel,
        ]),
      ])
      .join("\n");

    expect(allCopy).toContain(knowledgeBase.marketing.offer.code);
    expect(allCopy).toContain(knowledgeBase.marketing.offer.label);
    expect(allCopy).toContain(getDiscountedDisplayPrice("starter", "monthly"));
    expect(allCopy).toContain(getDiscountedDisplayPrice("growth", "monthly"));
    expect(allCopy).toContain(getDiscountedDisplayPrice("scale", "monthly"));
    expect(allCopy).toContain(knowledgeBase.marketing.offer.guaranteeLabel);
    expect(allCopy).not.toContain("LAUNCH" + "30");
    expect(allCopy).not.toContain("30% off your first" + " year");
    expect(allCopy).not.toContain("May 31" + ", 2026");
  });

  it("derives nurture offer/pricing copy from shared knowledge helpers", () => {
    const source = readFileSync("src/emails/content/magnets.ts", "utf8");

    expect(source).toContain("knowledgeBase.marketing");
    expect(source).toContain("getDiscountedDisplayPrice");
    expect(source).toContain("canonicalPricingUrl");
    expect(source).toContain("canonicalMarketingUrl");
    expect(source).not.toContain('"https://gavelhouse.app/#pricing"');
    expect(source).not.toContain('"https://gavelhouse.app');
    expect(source).not.toContain("trial is 1 month");
    expect(source).not.toContain("1-month trial");
    expect(source).not.toContain("1-month free trial");
    expect(source).not.toContain('"Y80OFF"');
    expect(source).not.toContain('"30-day money-back guarantee"');
    expect(source).not.toContain('"$17.50/mo Starter"');
  });

  it("rejects legacy CTA route prefixes", () => {
    for (const legacyPath of [
      "/features/old-path",
      "/guides/old-path",
      "/lead-magnets/old-path",
      "/signup",
    ]) {
      const mutated = structuredClone(magnetConfigs[0]);
      mutated.steps[0] = {
        ...mutated.steps[0],
        ctaUrl: `https://gavelhouse.app${legacyPath}`,
      };

      expect(() => validateMagnetConfigRoutes([mutated])).toThrow(
        /Legacy CTA path/,
      );
    }
  });

  it("rejects CTA URLs on the wrong origin", () => {
    const mutated = structuredClone(magnetConfigs[0]);
    mutated.steps[0] = {
      ...mutated.steps[0],
      ctaUrl:
        "https://example.com/resources/guides/hoa-reserve-fund-compliance-guide/",
    };

    expect(() => validateMagnetConfigRoutes([mutated])).toThrow(
      /Invalid CTA origin/,
    );
  });

  it("derives CTA origin validation from the marketing KB domain", () => {
    const source = readFileSync("src/emails/content/magnets.ts", "utf8");

    expect(source).toContain("canonicalMarketingOrigin");
    expect(source).not.toContain('url.origin !== "https://gavelhouse.app"');
  });

  it("rejects CTA URLs on non-boardstack origins", () => {
    const mutated = structuredClone(magnetConfigs[0]);
    mutated.steps[0] = {
      ...mutated.steps[0],
      ctaUrl: "https://example.com/resources/hoa-guide",
    };

    expect(() => validateMagnetConfigRoutes([mutated])).toThrow(
      /Invalid CTA origin/,
    );
  });

  for (const slug of LEAD_MAGNET_SLUGS) {
    describe(`magnet ${slug}`, () => {
      const m = magnetConfigs.find((x) => x.slug === slug)!;

      it("has a title, persona tag, delivery subject+preheader+body", () => {
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.personaTag.length).toBeGreaterThan(0);
        expect(m.deliverySubject.length).toBeGreaterThan(0);
        expect(m.deliveryPreheader.length).toBeGreaterThan(0);
        expect(m.deliveryBodyMarkdown.length).toBeGreaterThan(0);
      });

      it("delivery body is 80-180 words", () => {
        const w = countWords(m.deliveryBodyMarkdown);
        expect(w).toBeGreaterThanOrEqual(80);
        expect(w).toBeLessThanOrEqual(180);
      });

      it("has exactly 4 nurture steps", () => {
        expect(m.steps).toHaveLength(4);
      });

      it("steps have dayOffsets [2, 5, 9, 14] in order", () => {
        expect(m.steps.map((s) => s.dayOffset)).toEqual([2, 5, 9, 14]);
      });

      it("every nurture step has required fields", () => {
        for (const s of m.steps) {
          expect(s.subject.length).toBeGreaterThan(0);
          expect(s.preheader.length).toBeGreaterThan(0);
          expect(s.heading.length).toBeGreaterThan(0);
          expect(s.bodyMarkdown.length).toBeGreaterThan(0);
          expect(s.ctaLabel.length).toBeGreaterThan(0);
        }
      });

      it("every nurture body is 80-180 words", () => {
        for (const s of m.steps) {
          const w = countWords(s.bodyMarkdown);
          expect(w, `step D${s.dayOffset} body`).toBeGreaterThanOrEqual(80);
          expect(w, `step D${s.dayOffset} body`).toBeLessThanOrEqual(180);
        }
      });

      it("every CTA URL is https and on the KB marketing domain", () => {
        for (const s of m.steps) {
          const url = new URL(s.ctaUrl);

          expect(url.protocol).toBe("https:");
          expect(url.hostname).toBe(knowledgeBase.marketing.product.domain);
        }
      });

      it("never uses legacy guide, lead-magnet, feature, or signup routes", () => {
        for (const s of m.steps) {
          expect(s.ctaUrl).not.toContain("https://gavelhouse.app/guides/");
          expect(s.ctaUrl).not.toContain(
            "https://gavelhouse.app/lead-magnets/",
          );
          expect(s.ctaUrl).not.toContain("https://gavelhouse.app/features/");
          expect(s.ctaUrl).not.toContain("https://gavelhouse.app/signup");
        }
      });
    });
  }
});

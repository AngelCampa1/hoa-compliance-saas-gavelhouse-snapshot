import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function readWebSource(relativePath: string): string {
  return readFileSync(`src/${relativePath}`, "utf8").replace(/\r\n/g, "\n");
}

function listRuntimeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listRuntimeSources(fullPath);
    }

    if (
      !/\.(astro|md|mdx|ts|tsx|css)$/.test(entry.name) ||
      /\.test\.(ts|tsx)$/.test(entry.name) ||
      entry.name === "promo-bar.astro"
    ) {
      return [];
    }

    return [fullPath];
  });
}

function readProjectSource(relativePath: string): string {
  return readFileSync(`../../${relativePath}`, "utf8").replace(/\r\n/g, "\n");
}

describe("B1 Memo shared shell source", () => {
  it("defines the parchment memo tokens in global CSS", () => {
    const source = readWebSource("styles/global.css");

    expect(source).toContain("--paper-0: #fbfaf5");
    // Darkened from #b14424 to meet WCAG AA on the --accent-3 tint (4.44:1 -> 5.13:1).
    expect(source).toContain("--accent: #a23d1f");
    expect(source).toContain('--serif: "Source Serif 4"');
    expect(source).toContain(".b1-doc-header");
    expect(source).toContain(".hi-mark");
    expect(source).toContain(".redline-block");
  });

  it("renders the Y80OFF promo from shared limited-offer pricing config", () => {
    const source = readWebSource("components/promo-bar.astro");

    expect(source).toContain("@boardstack/shared");
    expect(source).toContain("knowledgeBase");
    expect(source).toContain("marketingKnowledge.offer.code");
    expect(source).toContain("marketingKnowledge.pricing.config.promoText");
    expect(source).toContain("Use code");
    expect(source).not.toContain("LAUNCH" + "30");
    expect(source).not.toContain("30% off your first" + " year");
    expect(source).toContain("marketingKnowledge.offer.label");
    expect(source).toContain("Start trial");
    expect(source).toContain("marketingKnowledge.funnel.publicSignupUrl");
    expect(source).not.toContain("PUBLIC_SIGNUP_URL");
  });

  it("uses the memo-style nav and footer components", () => {
    const header = readWebSource("components/site-header.astro");
    const footer = readWebSource("components/site-footer.astro");

    expect(header).toContain("b1-site-nav");
    expect(header).toContain("{siteName}");
    expect(header).toContain("BrandLogoMark");
    expect(header).toContain("Start trial");
    expect(header).toContain("marketingKnowledge.funnel.publicSignupUrl");
    expect(header).not.toContain("PUBLIC_SIGNUP_URL");
    expect(header).toContain("Log in");
    expect(footer).toContain("b1-site-footer");
    expect(footer).toContain("BrandLogoMark");
    expect(footer).toContain(
      "Compliance-first HOA & condo software for self-managed boards.",
    );
    expect(footer).toContain("BRAND_DOMAIN");
  });

  it("provides a reusable DocHeader component with kicker, re, and meta props", () => {
    const source = readWebSource("components/doc-header.astro");

    expect(source).toContain("kicker: string");
    expect(source).toContain("re: string");
    expect(source).toContain("meta?:");
    expect(source).toContain("b1-doc-header");
    expect(source).toContain("doc-meta");
  });
});

describe("B1 Memo pricing and promo copy guards", () => {
  it("renders pricing from shared siteConfig tiers with limited offer discounts", () => {
    const pricing = readWebSource("pages/pricing.astro");

    expect(pricing).toContain("siteConfig.pricingTiers");
    expect(pricing).not.toContain("const tiers = [");
    expect(pricing).toContain("offerPrice");
    expect(pricing).toContain("annualOfferBillingText");
    expect(pricing).toContain("limitedOffer.percentOff");
    expect(pricing).toContain('data-billing-toggle="annual"');
    expect(pricing).toContain('aria-pressed="true"');
    expect(pricing).toContain('data-billing-panel="annual"');
    expect(pricing).toContain('data-billing-panel="monthly"');
    expect(pricing).not.toContain("originalPrice");
    expect(pricing).not.toContain("annualOriginalPrice");
    expect(pricing).not.toContain("monthlyOriginalPrice");
    expect(pricing).not.toContain("getOriginalDisplayPrice");
    expect(pricing).toContain(
      "const annualOfferDisplayPrice = getDiscountedDisplayPrice(",
    );
    expect(pricing).toContain(
      "stripMonthlyPriceSuffix(annualOfferDisplayPrice)",
    );
    expect(pricing).toContain(
      'getDiscountedDisplayPrice(tier.slug, "monthly")',
    );
    expect(pricing).toContain("limitedOffer.annual.code");
    expect(pricing).toContain("limitedOffer.monthly.code");
    expect(pricing).toContain("limitedOffer.badgeLabel");

    for (const oldPrice of ["$20/mo", "$49/mo", "$99/mo", "$199/mo"]) {
      expect(pricing).not.toContain(oldPrice);
    }
  });

  it("keeps Start trial links from pointing at the pricing page", () => {
    const offenders = listRuntimeSources("src")
      .filter((path) => {
        const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
        return /href=["{]\/pricing\/["}][\s\S]{0,120}Start trial/i.test(source);
      })
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
  });

  it("routes homepage primary board-running CTA through the signup target", () => {
    const homepage = readWebSource("pages/index.astro");

    expect(homepage).toContain("const signupUrl");
    expect(homepage).toContain(
      '<a class="b1-button b1-button--primary" href={signupUrl}>',
    );
    expect(homepage).not.toContain(
      '<a class="b1-button b1-button--primary" href="/pricing/">\n              Run my community',
    );
  });

  it("keeps retired limited-offer copy out of runtime source", () => {
    const offenders = listRuntimeSources("src")
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes("30% off your first" + " year");
      })
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
    const sharedPricing = readProjectSource("packages/shared/src/pricing.ts");
    const sharedBrand = readProjectSource("packages/shared/src/brand.ts");
    // pricing.ts now legitimately defines M80OFF/Y80OFF limited-offer codes.
    expect(sharedPricing).not.toContain("30% off your first" + " year");
    // brand.ts should not reference retired phase-specific offer codes.
    expect(sharedBrand).not.toContain("LAUNCH" + "30");
    expect(sharedBrand).not.toContain("30% off your first" + " year");
  });

  it("keeps public contact and brand casing canonical", () => {
    const runtimeSources = listRuntimeSources("src").map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    }));
    const staleBrandName = "Board" + "Stack";
    const staleTitleBrandName = "Board" + "stack";
    const staleRootDomain = "boardstack" + ".app";

    const staleContact = runtimeSources
      .filter(({ source }) => source.includes(`angel.campa@${staleRootDomain}`))
      .map(({ path }) => relative(process.cwd(), path));
    const wrongContactCasing = runtimeSources
      .filter(({ source }) => source.includes("angel.campa@Gavelhouse.app"))
      .map(({ path }) => relative(process.cwd(), path));
    const staleBrand = runtimeSources
      .filter(
        ({ source }) =>
          source.includes(staleBrandName) ||
          source.includes(staleTitleBrandName),
      )
      .map(({ path }) => relative(process.cwd(), path));
    const wrongBrandCasing = runtimeSources
      .filter(({ source }) => source.includes("GavelHouse"))
      .map(({ path }) => relative(process.cwd(), path));
    const staleSignupHost = runtimeSources
      .filter(({ source }) => source.includes(`my.${staleRootDomain}`))
      .map(({ path }) => relative(process.cwd(), path));
    const wrongSignupHostCasing = runtimeSources
      .filter(({ source }) => source.includes("my.Gavelhouse.app"))
      .map(({ path }) => relative(process.cwd(), path));

    expect(staleContact).toEqual([]);
    expect(wrongContactCasing).toEqual([]);
    expect(staleBrand).toEqual([]);
    expect(wrongBrandCasing).toEqual([]);
    expect(staleSignupHost).toEqual([]);
    expect(wrongSignupHostCasing).toEqual([]);
    expect(readWebSource("components/site-footer.astro")).toContain(
      "contactEmail",
    );
  });
});

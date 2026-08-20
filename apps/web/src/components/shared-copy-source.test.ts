import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readWebSource(relativePath: string): string {
  return readFileSync(`src/${relativePath}`, "utf8");
}

describe("shared copy source regressions", () => {
  it("does not hardcode the old B2B eyebrow into ProblemAgitation", () => {
    const source = readSource("./problem-agitation.astro");

    expect(source).not.toContain("The Planning Problem");
    expect(source).toContain("config.eyebrow");
  });

  it("hardens ProblemAgitation against long-copy overflow in the pain-point grid", () => {
    const source = readSource("./problem-agitation.astro");

    expect(source).toContain("min-w-0");
    expect(source).toContain("overflow-wrap:anywhere");
  });

  it("does not default FAQ headings to team-evaluation language", () => {
    const source = readSource("./faq-section.astro");

    expect(source).not.toContain("Answers for teams evaluating the fit");
    expect(source).toContain("resolveFaqHeading");
  });

  it("keeps PublicSignupCta focused on CTA-only props in the React island", () => {
    const source = readSource("./public-signup-cta.tsx");

    expect(source).not.toContain("surveyQuestions");
    expect(source).not.toContain("discoveryCallUrl");
    expect(source).toContain("sourcePage: string;");
    expect(source).toContain("ctaTarget?: string;");
  });

  it("keeps PublicSignupCta focused on CTA-only props in the Astro wrapper", () => {
    const source = readSource("./public-signup-cta.astro");

    expect(source).not.toContain("surveyQuestions");
    expect(source).not.toContain("discoveryCallUrl");
    expect(source).toContain("sourcePage: string;");
    expect(source).toContain("ctaTarget?: string;");
  });

  it("renders founder byline fields in ArticleMeta", () => {
    const source = readSource("./article-meta.astro");

    expect(source).toContain("authorName?: string");
    expect(source).toContain("authorTitle?: string");
    expect(source).toContain("authorUrl?: string");
    expect(source).toContain("const bylineText = authorName");
    expect(source).toContain(
      '`By ${authorName}${authorTitle ? `, ${authorTitle}` : ""}`',
    );
  });

  it("passes site author data into article metadata across SEO layouts", () => {
    const layoutPaths = [
      "layouts/article-layout.astro",
      "layouts/comparison-layout.astro",
      "layouts/content-layout.astro",
      "layouts/listicle-layout.astro",
      "layouts/pricing-breakdown-layout.astro",
      "components/lead-magnet-page.astro",
    ];

    for (const path of layoutPaths) {
      const source = readWebSource(path);

      expect(source).toContain("authorName={config.author?.name}");
      expect(source).toContain("authorTitle={config.author?.title}");
      expect(source).toContain("authorUrl={config.author?.url}");
    }
  });

  it("passes site author data into lead magnet article meta tags", () => {
    const source = readWebSource("components/lead-magnet-page.astro");

    expect(source).toContain("articleAuthor={config.author?.name}");
  });

  it("uses the configured author as Organization founder on company pages", () => {
    const aboutSource = readWebSource("pages/about.astro");
    const contactSource = readWebSource("pages/contact.astro");

    expect(aboutSource).toContain("config={siteConfig}");
    expect(contactSource).toContain("config={siteConfig}");
    expect(aboutSource).toContain("Angel Campa");
    expect(contactSource).toContain("Angel Campa");
  });

  it("does not submit the contact page through a mailto form action", () => {
    const contactSource = readWebSource("pages/contact.astro");

    expect(contactSource).not.toContain('action="mailto:');
    expect(contactSource).not.toContain("<form");
    expect(contactSource).toContain("mailto:${siteConfig.contactEmail}");
  });

  it("keeps the homepage plain and focused on self-managed boards", () => {
    const source = readWebSource("pages/index.astro");

    expect(source).toContain("GAVELHOUSE");
    expect(source).toContain("For self-managed HOA and condo boards.");
    expect(source).toContain("What gets messy");
    expect(source).toContain("Run your HOA without the spreadsheet mess.");
    expect(source).toContain("Start trial");
    expect(source).not.toContain("MEMORANDUM");
    expect(source).not.toContain("Executive summary");
  });

  it("aligns core marketing pages to the Start trial CTA", () => {
    const paths = [
      "pages/pricing.astro",
      "pages/product/[...page].astro",
      "pages/product/[slug].astro",
      "pages/solutions/[...page].astro",
      "pages/solutions/[slug].astro",
    ];

    for (const path of paths) {
      const source = readWebSource(path);

      expect(source).toContain("Start trial");
      expect(source).not.toContain("See Plans & Pricing");
    }
  });

  it("keeps new product and solution clarity sections accessible as headings", () => {
    const productSource = readWebSource("pages/product/[slug].astro");
    const solutionSource = readWebSource("pages/solutions/[slug].astro");

    expect(productSource).toContain("<h2");
    expect(productSource).toContain("What this helps with");
    expect(solutionSource).toContain("<h2");
    expect(solutionSource).toContain("How Gavelhouse helps {audienceLabel}");
  });

  it("keeps solution detail audience copy broad enough for managers and boards", () => {
    const solutionSource = readWebSource("pages/solutions/[slug].astro");

    expect(solutionSource).toContain("const solutionAudienceSummary");
    expect(solutionSource).toContain("boards, managers, and operators");
    expect(solutionSource).not.toContain(
      "<strong>For:</strong> volunteer-led HOA and condo communities.",
    );
  });

  it("passes the configured author into HOA compliance geo Article schema", () => {
    const source = readWebSource("pages/hoa-compliance/[slug].astro");

    expect(source).toContain("const geoSchema = buildGeoArticleSchema({");
    expect(source).toContain("author: siteConfig.author");
  });

  it("passes the configured author into pros and cons Review schema blocks", () => {
    const blockSource = readWebSource("seo/pros-cons-block.astro");
    const alternativeSource = readWebSource(
      "pages/compare/alternatives/[slug].astro",
    );
    const versusSource = readWebSource(
      "pages/compare/versus/[slugA]-vs-[slugB].astro",
    );

    expect(blockSource).toContain("reviewer?: PersonSchemaOpts");
    expect(blockSource).toContain("reviewer,");
    expect(blockSource).toContain(
      "buildProsConsReviewSchema({ subject, pros, cons, reviewer })",
    );
    expect(alternativeSource).toContain("reviewer={siteConfig.author}");
    expect(versusSource).toContain("reviewer={siteConfig.author}");
  });
});

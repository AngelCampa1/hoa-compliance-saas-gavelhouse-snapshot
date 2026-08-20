import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("editorial layout source regressions", () => {
  it("lets editorial pages disable non-essential base layout enhancements", () => {
    const baseLayoutSource = readSource("./base-layout.astro");

    expect(baseLayoutSource).toContain("enableScrollReveal");
    expect(baseLayoutSource).toContain("{enableScrollReveal &&");
  });

  it("removes footer email capture from long-form editorial layouts", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    for (const source of [
      articleLayoutSource,
      comparisonLayoutSource,
      contentLayoutSource,
      listicleLayoutSource,
      pricingLayoutSource,
    ]) {
      expect(source).toContain("enableScrollReveal={false}");
      expect(source).toContain('captureVariant="none"');
    }
  });

  it("uses darker shared label treatments for TOC and footer scan text", () => {
    const tocSource = readSource("../components/table-of-contents.astro");
    const footerSource = readSource("../components/site-footer.astro");

    expect(tocSource).toContain("text-[var(--color-accent-800)]");
    // B-1 refactored the footer to an accordion pattern using <details>/<summary>.
    // Heading styles live on .b1-site-footer__summary h2 (promoted from h4 to
    // avoid an h2->h4 heading-order skip flagged by axe).  Assert the new
    // selectors and that the two brand colours (muted body text and bright
    // heading text) are still present.
    expect(footerSource).toContain("b1-site-footer__summary h2");
    expect(footerSource).toContain("color: #c9c2b1");
    expect(footerSource).toContain("color: #f3eddd");
  });

  it("flattens repeated blur-heavy shared chrome surfaces", () => {
    const headerSource = readSource("../components/site-header.astro");

    expect(headerSource).not.toContain("backdrop-blur-sm");
    expect(headerSource).not.toContain("backdrop-blur-xl");
    expect(headerSource).not.toContain("backdrop-filter: blur(10px)");
  });

  it("uses the memo details mobile nav without blur-heavy chrome", () => {
    const headerSource = readSource("../components/site-header.astro");

    expect(headerSource).toContain('class="b1-site-nav__mobile"');
    expect(headerSource).toContain('aria-label="Toggle navigation menu"');
    expect(headerSource).toContain("b1-site-nav__mobile-panel");
    expect(headerSource).toContain("<summary");
    expect(headerSource).not.toContain("data-mobile-nav-overlay");
  });

  it("supports stacked comparison cells for editorial tables on small screens", () => {
    const comparisonTableSource = readSource(
      "../components/comparison-table.astro",
    );

    // B-4 replaced the CSS @media (max-width: 40rem) stacking approach with a
    // dual-render pattern: a mobile card view (ct-cards, md:hidden) and a
    // desktop scrollable table (hidden md:block).  The data-column-label
    // attribute on each <td> is still present in the desktop table so it acts
    // as the accessible column label for assistive tech.
    expect(comparisonTableSource).toContain(
      "data-column-label={headers[i + 1]}",
    );
    // Mobile card view — visible by default, hidden on md+
    expect(comparisonTableSource).toContain("ct-cards md:hidden");
    // Each card has a feature-name header and a two-column inner grid
    expect(comparisonTableSource).toContain("ct-card__feature");
    expect(comparisonTableSource).toContain("ct-card__grid");
    // Desktop table — hidden on mobile, shown on md+
    expect(comparisonTableSource).toContain("hidden md:block");
  });
});

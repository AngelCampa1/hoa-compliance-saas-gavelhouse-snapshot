import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "./site-header.astro"),
  "utf8",
).replace(/\r\n/g, "\n");

// Brand constants are the source of truth for nav data — check them here too.
const brandSource = readFileSync(
  resolve(__dirname, "../../../../packages/shared/src/brand.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("B1 Memo site-header source", () => {
  it("renders the memo navigation shell and simplified route set", () => {
    expect(source).toContain("b1-site-nav");
    expect(source).toContain("Product");
    expect(source).toContain("Pricing");
    expect(source).toContain("Resources");
    expect(source).toContain("About");
    expect(source).not.toContain('{ label: "Compare", href: "/compare/" }');
    expect(source).not.toContain(
      '{ label: "HOA compliance", href: "/hoa-compliance/" }',
    );
  });

  it("uses a semantic details menu for mobile navigation", () => {
    expect(source).toContain('<details class="b1-site-nav__mobile">');
    expect(source).toContain('aria-label="Toggle navigation menu"');
    expect(source).toContain("b1-site-nav__mobile-panel");
  });

  it("includes sign-in links in desktop and mobile navigation", () => {
    expect(source).toContain("publicAppUrl");
    expect(source).not.toContain('"https://my.gavelhouse.app"');
    const signInCount = (source.match(/data-sign-in-link/g) ?? []).length;
    expect(signInCount).toBe(2);
  });

  it("defaults the primary trial CTA to the signup app", () => {
    expect(source).toContain("knowledgeBase.marketing");
    expect(source).toContain(
      "ctaHref = marketingKnowledge.funnel.publicSignupUrl",
    );
    expect(source).not.toContain("PUBLIC_SIGNUP_URL");
  });

  it("uses the Gavelhouse logo mark and wordmark colors", () => {
    expect(source).toContain("BrandLogoMark");
    expect(source).toContain("b1-site-nav__wordmark");
    expect(source).toContain("<span>Gavel</span><span>house</span>");
    expect(source).not.toContain("src={logoLight}");
    expect(source).not.toContain(">BS<");
  });

  it("keeps the shared public header to four top-level buckets", () => {
    expect(source).toContain("megaMenu");
    expect(source).toContain("b1-site-nav__mega-panel");

    const navItemsBlock = brandSource.match(
      /export const NAV_ITEMS: NavItem\[] = \[([\s\S]*?)\];/,
    )?.[1];
    expect(navItemsBlock).toBeDefined();

    const labels = [
      ...(navItemsBlock ?? "").matchAll(
        /^\s{2}(?:\{ label: "([^"]+)"|\{\n\s{4}label: "([^"]+)")/gm,
      ),
    ].map((match) => match[1] ?? match[2]);

    expect(labels).toEqual(["Product", "Resources", "Pricing", "About"]);
    expect(labels).not.toContain("Who it's for");
    expect(labels).not.toContain("Compare");
    expect(labels).not.toContain("HOA compliance");
  });

  it("moves persona and comparison links inside dropdown buckets", () => {
    expect(source).toContain("b1-site-nav__mega-link");
    expect(brandSource).toContain(
      "/solutions/hoa-treasurer-liability-software/",
    );
    expect(brandSource).toContain("/compare/");
  });
});

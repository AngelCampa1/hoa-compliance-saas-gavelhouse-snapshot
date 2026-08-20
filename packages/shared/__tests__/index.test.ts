import { describe, it, expect } from "vitest";
import { GAVELHOUSE_VERSION } from "../src/index.js";
import {
  BRAND_NAME,
  BRAND_DOMAIN,
  BRAND_TAGLINE,
  BRAND_CONTACT_EMAIL,
  BRAND_PRIVACY_EMAIL,
  BRAND_AREA_SERVED,
  BRAND_META_DESCRIPTION,
  BRAND_DEFAULT_OG_IMAGE,
  BRAND_DISCOVERY_CALL_URL,
  BRAND_DISCOVERY_CALL_INCENTIVE,
  BRAND_LOGO,
  BRAND_THEME,
  BRAND_AUTHOR,
  PRODUCT_CATEGORY,
  PRODUCT_PRICE,
  PRODUCT_TARGET_AUDIENCE,
  TRUST_SIGNALS,
  HERO_BENEFITS,
  COMPETITORS,
  FUNNEL_TOFU,
  FUNNEL_MOFU,
  FUNNEL_BOFU,
  FUNNEL_CTA_SUBTITLE,
  SURVEY_QUESTIONS,
  FAQS,
  PRICING_TIERS,
  PRICING_CONFIG,
  NAV_ITEMS,
  FOOTER_LINK_GROUPS,
  FOOTER_LEGAL_LINKS,
  PROBLEM_AGITATION,
  REFERRAL_REWARDS,
  LEAD_MAGNET,
  COPY,
} from "../src/brand.js";

describe("shared package", () => {
  it("exports GAVELHOUSE_VERSION as a string", () => {
    expect(typeof GAVELHOUSE_VERSION).toBe("string");
  });

  it("GAVELHOUSE_VERSION has the expected format", () => {
    expect(GAVELHOUSE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("brand -- identity constants", () => {
  it("BRAND_NAME is Gavelhouse", () => {
    expect(BRAND_NAME).toBe("Gavelhouse");
  });

  it("BRAND_DOMAIN is gavelhouse.app", () => {
    expect(BRAND_DOMAIN).toBe("gavelhouse.app");
  });

  it("BRAND_TAGLINE is a non-empty string", () => {
    expect(typeof BRAND_TAGLINE).toBe("string");
    expect(BRAND_TAGLINE.length).toBeGreaterThan(0);
  });

  it("BRAND_CONTACT_EMAIL contains @", () => {
    expect(BRAND_CONTACT_EMAIL).toContain("@");
  });

  it("BRAND_PRIVACY_EMAIL is angel.campa@gavelhouse.app", () => {
    expect(BRAND_PRIVACY_EMAIL).toBe("angel.campa@gavelhouse.app");
  });

  it("BRAND_AREA_SERVED is United States", () => {
    expect(BRAND_AREA_SERVED).toBe("United States");
  });

  it("BRAND_META_DESCRIPTION is a non-empty string", () => {
    expect(typeof BRAND_META_DESCRIPTION).toBe("string");
    expect(BRAND_META_DESCRIPTION.length).toBeGreaterThan(0);
  });

  it("BRAND_DEFAULT_OG_IMAGE starts with /", () => {
    expect(BRAND_DEFAULT_OG_IMAGE).toMatch(/^\//);
  });

  it("BRAND_DISCOVERY_CALL_URL is a valid URL", () => {
    expect(() => new URL(BRAND_DISCOVERY_CALL_URL)).not.toThrow();
  });

  it("BRAND_DISCOVERY_CALL_INCENTIVE is a non-empty string", () => {
    expect(typeof BRAND_DISCOVERY_CALL_INCENTIVE).toBe("string");
    expect(BRAND_DISCOVERY_CALL_INCENTIVE.length).toBeGreaterThan(0);
  });

  it("BRAND_LOGO exposes a light variant", () => {
    expect(BRAND_LOGO.light).toMatch(/\.svg$/);
  });

  it("BRAND_THEME has required color keys", () => {
    const required = [
      "primary",
      "accent",
      "surface",
      "text",
      "muted",
      "error",
      "success",
    ];
    for (const key of required) {
      expect(BRAND_THEME).toHaveProperty(key);
      expect(typeof BRAND_THEME[key as keyof typeof BRAND_THEME]).toBe(
        "string",
      );
    }
  });

  it("BRAND_THEME.fonts has heading, body, mono", () => {
    expect(typeof BRAND_THEME.fonts.heading).toBe("string");
    expect(typeof BRAND_THEME.fonts.body).toBe("string");
    expect(typeof BRAND_THEME.fonts.mono).toBe("string");
  });

  it("BRAND_AUTHOR has name and url", () => {
    expect(typeof BRAND_AUTHOR.name).toBe("string");
    expect(typeof BRAND_AUTHOR.url).toBe("string");
  });

  it("BRAND_AUTHOR identifies Angel Campa as founder with LinkedIn profile", () => {
    expect(BRAND_AUTHOR).toMatchObject({
      name: "Angel Campa",
      title: "Founder",
      jobTitle: "Founder",
      url: "https://www.linkedin.com/in/angelcampa1/",
      sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
    });
  });
});

describe("brand -- product", () => {
  it("PRODUCT_CATEGORY is a non-empty string", () => {
    expect(typeof PRODUCT_CATEGORY).toBe("string");
    expect(PRODUCT_CATEGORY.length).toBeGreaterThan(0);
  });

  it("PRODUCT_PRICE mentions /mo", () => {
    expect(PRODUCT_PRICE).toContain("/mo");
  });

  it("PRODUCT_TARGET_AUDIENCE is a non-empty string", () => {
    expect(typeof PRODUCT_TARGET_AUDIENCE).toBe("string");
    expect(PRODUCT_TARGET_AUDIENCE.length).toBeGreaterThan(0);
  });

  it("TRUST_SIGNALS is a non-empty array", () => {
    expect(Array.isArray(TRUST_SIGNALS)).toBe(true);
    expect(TRUST_SIGNALS.length).toBeGreaterThan(0);
  });

  it("each trust signal has text and category", () => {
    for (const signal of TRUST_SIGNALS) {
      expect(typeof signal.text).toBe("string");
      expect(["feature", "roi", "compliance", "integration"]).toContain(
        signal.category,
      );
    }
  });

  it("HERO_BENEFITS is a non-empty string array", () => {
    expect(Array.isArray(HERO_BENEFITS)).toBe(true);
    expect(HERO_BENEFITS.length).toBeGreaterThan(0);
    for (const b of HERO_BENEFITS) {
      expect(typeof b).toBe("string");
    }
  });
});

describe("brand -- competitors", () => {
  it("COMPETITORS has at least 10 entries", () => {
    expect(COMPETITORS.length).toBeGreaterThanOrEqual(10);
  });

  it("each competitor has slug, name, pricing, weakness", () => {
    for (const c of COMPETITORS) {
      expect(typeof c.slug).toBe("string");
      expect(typeof c.name).toBe("string");
      expect(typeof c.pricing).toBe("string");
      expect(typeof c.weakness).toBe("string");
    }
  });

  it("competitor slugs are unique", () => {
    const slugs = COMPETITORS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("includes payhoa competitor", () => {
    expect(COMPETITORS.find((c) => c.slug === "payhoa")).toBeDefined();
  });
});

describe("brand -- funnel", () => {
  it("FUNNEL_TOFU has ctaMode educate", () => {
    expect(FUNNEL_TOFU.ctaMode).toBe("educate");
    expect(typeof FUNNEL_TOFU.ctaText).toBe("string");
    expect(typeof FUNNEL_TOFU.ctaTarget).toBe("string");
  });

  it("FUNNEL_MOFU has ctaMode evaluate", () => {
    expect(FUNNEL_MOFU.ctaMode).toBe("evaluate");
  });

  it("FUNNEL_BOFU has ctaMode convert", () => {
    expect(FUNNEL_BOFU.ctaMode).toBe("convert");
  });

  it("FUNNEL_BOFU sends trial signups to the production signup app", () => {
    expect(FUNNEL_BOFU.ctaTarget).toBe("https://my.gavelhouse.app/signup");
  });

  it("FUNNEL_CTA_SUBTITLE is a non-empty string", () => {
    expect(typeof FUNNEL_CTA_SUBTITLE).toBe("string");
    expect(FUNNEL_CTA_SUBTITLE.length).toBeGreaterThan(0);
  });
});

describe("brand -- survey", () => {
  it("SURVEY_QUESTIONS has 3 questions", () => {
    expect(SURVEY_QUESTIONS).toHaveLength(3);
  });

  it("each question has id, text, and options array", () => {
    for (const q of SURVEY_QUESTIONS) {
      expect(typeof q.id).toBe("string");
      expect(typeof q.text).toBe("string");
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBeGreaterThan(0);
    }
  });

  it("survey question ids are unique", () => {
    const ids = SURVEY_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("brand -- FAQs", () => {
  it("FAQS is a non-empty array", () => {
    expect(Array.isArray(FAQS)).toBe(true);
    expect(FAQS.length).toBeGreaterThan(0);
  });

  it("each FAQ has q and a strings", () => {
    for (const faq of FAQS) {
      expect(typeof faq.q).toBe("string");
      expect(typeof faq.a).toBe("string");
      expect(faq.q.length).toBeGreaterThan(0);
      expect(faq.a.length).toBeGreaterThan(0);
    }
  });
});

describe("brand -- pricing tiers", () => {
  it("PRICING_TIERS has exactly 3 priced public tiers", () => {
    expect(PRICING_TIERS).toHaveLength(3);
  });

  it("each tier has required fields", () => {
    for (const tier of PRICING_TIERS) {
      expect(typeof tier.name).toBe("string");
      expect(typeof tier.price).toBe("string");
      expect(typeof tier.description).toBe("string");
      expect(Array.isArray(tier.features)).toBe(true);
      expect(tier.features.length).toBeGreaterThan(0);
      expect(typeof tier.monthlyPriceCents).toBe("number");
    }
  });

  it("exactly one tier is highlighted", () => {
    const highlighted = PRICING_TIERS.filter((t) => t.highlighted);
    expect(highlighted).toHaveLength(1);
  });

  it("tier names are Starter, Growth, Scale", () => {
    expect(PRICING_TIERS.map((t) => t.name)).toEqual([
      "Starter",
      "Growth",
      "Scale",
    ]);
  });

  it("monthlyPriceCents are positive integers", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.monthlyPriceCents).toBeGreaterThan(0);
      expect(Number.isInteger(tier.monthlyPriceCents)).toBe(true);
    }
  });

  it("PRICING_CONFIG has required keys", () => {
    expect(typeof PRICING_CONFIG.trialBannerText).toBe("string");
    expect(typeof PRICING_CONFIG.annualSavingsText).toBe("string");
    expect(typeof PRICING_CONFIG.monthlyToggleLabel).toBe("string");
    expect(typeof PRICING_CONFIG.annualToggleLabel).toBe("string");
  });

  it("Portfolio is not a priced public tier", () => {
    expect(PRICING_TIERS.some((t) => t.slug === "portfolio")).toBe(false);
  });

  it("priced public tiers do not have contactSales: true", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.contactSales).not.toBe(true);
    }
  });
});

describe("brand -- navigation", () => {
  it("NAV_ITEMS is a non-empty array", () => {
    expect(Array.isArray(NAV_ITEMS)).toBe(true);
    expect(NAV_ITEMS.length).toBeGreaterThan(0);
  });

  it("each nav item has label and href", () => {
    for (const item of NAV_ITEMS) {
      expect(typeof item.label).toBe("string");
      expect(typeof item.href).toBe("string");
    }
  });

  it("navigation exposes product help via the Resources mega menu", () => {
    const resourcesItem = NAV_ITEMS.find((item) => item.href === "/resources/");
    expect(resourcesItem).toBeDefined();
    const allMegaLinks = resourcesItem?.megaMenu?.flatMap((s) => s.links) ?? [];
    expect(
      allMegaLinks.find(
        (link) => link.href === "/resources/hubs/gavelhouse-product-help/",
      ),
    ).toBeDefined();
  });

  it("Resources nav item exposes a grouped megamenu", () => {
    const resourcesItem = NAV_ITEMS.find((item) => item.href === "/resources/");

    expect(resourcesItem?.megaMenu).toBeDefined();
    expect(resourcesItem?.megaMenu?.map((s) => s.heading)).toEqual([
      "Guides",
      "Software Roundups",
      "Free Tools & Templates",
      "Compliance",
      "Compare",
      "Help",
    ]);
    for (const section of resourcesItem?.megaMenu ?? []) {
      expect(section.links.length).toBeGreaterThanOrEqual(1);
      expect(section.links[0].href).toMatch(/^\/.+\/$/);
    }
  });

  it("Resources mega menu links only to hub pages", () => {
    const resourcesItem = NAV_ITEMS.find((item) => item.href === "/resources/");
    const allMegaLinks = resourcesItem?.megaMenu?.flatMap((s) => s.links) ?? [];

    expect(allMegaLinks.length).toBeGreaterThan(0);
    for (const link of allMegaLinks) {
      expect(link.href).toMatch(
        /^\/(?:resources\/(?:hubs\/[-a-z0-9]+|guides|best)|compare(?:\/(?:alternatives|pricing|versus))?|free|hoa-compliance|product|solutions|help)\/$/,
      );
    }
  });

  it("FOOTER_LINK_GROUPS is a non-empty array", () => {
    expect(Array.isArray(FOOTER_LINK_GROUPS)).toBe(true);
    expect(FOOTER_LINK_GROUPS.length).toBeGreaterThan(0);
  });

  it("each footer group has heading and non-empty links array", () => {
    for (const group of FOOTER_LINK_GROUPS) {
      expect(typeof group.heading).toBe("string");
      expect(Array.isArray(group.links)).toBe(true);
      expect(group.links.length).toBeGreaterThan(0);
    }
  });

  it("FOOTER_LEGAL_LINKS has privacy and terms links", () => {
    expect(
      FOOTER_LEGAL_LINKS.find((l) => l.href === "/privacy/"),
    ).toBeDefined();
    expect(FOOTER_LEGAL_LINKS.find((l) => l.href === "/terms/")).toBeDefined();
  });

  it("footer links include the help center", () => {
    const allFooterLinks = FOOTER_LINK_GROUPS.flatMap((group) => group.links);

    expect(allFooterLinks.find((link) => link.href === "/help/")).toBeDefined();
  });

  it("footer Resources links expose every important marketing hub", () => {
    const resources = FOOTER_LINK_GROUPS.find(
      (group) => group.heading === "Resources",
    );
    const hrefs = resources?.links.map((link) => link.href) ?? [];

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/resources/",
        "/resources/guides/",
        "/resources/best/",
        "/free/",
        "/hoa-compliance/",
        "/compare/",
        "/pricing/",
        "/help/",
      ]),
    );
  });
});

describe("brand -- problem agitation", () => {
  it("PROBLEM_AGITATION has heading, closingLine, and painPoints", () => {
    expect(typeof PROBLEM_AGITATION.heading).toBe("string");
    expect(typeof PROBLEM_AGITATION.closingLine).toBe("string");
    expect(Array.isArray(PROBLEM_AGITATION.painPoints)).toBe(true);
    expect(PROBLEM_AGITATION.painPoints.length).toBeGreaterThan(0);
  });

  it("each pain point is a non-empty string", () => {
    for (const point of PROBLEM_AGITATION.painPoints) {
      expect(typeof point).toBe("string");
      expect(point.length).toBeGreaterThan(0);
    }
  });
});

describe("brand -- referral", () => {
  it("REFERRAL_REWARDS is a non-empty array", () => {
    expect(Array.isArray(REFERRAL_REWARDS)).toBe(true);
    expect(REFERRAL_REWARDS.length).toBeGreaterThan(0);
  });

  it("each reward has threshold and description", () => {
    for (const reward of REFERRAL_REWARDS) {
      expect(typeof reward.threshold).toBe("number");
      expect(reward.threshold).toBeGreaterThan(0);
      expect(typeof reward.description).toBe("string");
    }
  });
});

describe("brand -- lead magnet", () => {
  it("LEAD_MAGNET has title, description, and slug", () => {
    expect(typeof LEAD_MAGNET.title).toBe("string");
    expect(typeof LEAD_MAGNET.description).toBe("string");
    expect(typeof LEAD_MAGNET.slug).toBe("string");
    expect(LEAD_MAGNET.slug.length).toBeGreaterThan(0);
  });
});

describe("brand -- copy overrides", () => {
  it("COPY.emailCapture has expected keys", () => {
    expect(typeof COPY.emailCapture.subtitle).toBe("string");
    expect(typeof COPY.emailCapture.whatHappensNext).toBe("string");
    expect(typeof COPY.emailCapture.surveyPreview).toBe("string");
  });

  it("COPY.survey has unqualifiedCtaText and target", () => {
    expect(typeof COPY.survey.unqualifiedCtaText).toBe("string");
    expect(typeof COPY.survey.unqualifiedCtaTarget).toBe("string");
  });

  it("COPY.funnelCta.benefitBullets is an array", () => {
    expect(Array.isArray(COPY.funnelCta.benefitBullets)).toBe(true);
    expect(COPY.funnelCta.benefitBullets.length).toBeGreaterThan(0);
  });

  it("COPY.faq has bottomCtaHeading, bottomCtaText, bottomCtaTarget", () => {
    expect(typeof COPY.faq.bottomCtaHeading).toBe("string");
    expect(typeof COPY.faq.bottomCtaText).toBe("string");
    expect(typeof COPY.faq.bottomCtaTarget).toBe("string");
  });

  it("COPY.exitPopup has expected keys", () => {
    expect(typeof COPY.exitPopup.headline).toBe("string");
    expect(typeof COPY.exitPopup.description).toBe("string");
    expect(typeof COPY.exitPopup.ctaText).toBe("string");
    expect(typeof COPY.exitPopup.leftPanelLabel).toBe("string");
    expect(typeof COPY.exitPopup.successSubMessage).toBe("string");
  });
});

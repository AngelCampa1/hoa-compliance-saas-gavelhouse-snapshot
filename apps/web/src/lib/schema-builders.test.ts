import { describe, it, expect } from "vitest";
import {
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildArticleSchema,
  buildOrganizationSchema,
  buildProductSchema,
  buildSoftwareApplicationSchema,
  buildItemListSchema,
  buildHowToSchema,
  buildWebSiteSchema,
  buildSearchActionSchema,
  buildReviewSchema,
  buildGeoArticleSchema,
  buildStatisticCitationSchema,
  buildPriceSpecificationSchema,
  buildDefinedTermSchema,
  mergeFaqSources,
  joinUrl,
  buildCollectionPageSchema,
  buildPageIdentityGraphSchemas,
} from "./schema-builders";
import { validateSchema } from "./schema-validators";

describe("joinUrl", () => {
  it("joins base without trailing slash and path with leading slash", () => {
    expect(joinUrl("https://example.com", "/about")).toBe(
      "https://example.com/about",
    );
  });

  it("strips trailing slash from base to avoid double slash", () => {
    expect(joinUrl("https://example.com/", "/about")).toBe(
      "https://example.com/about",
    );
  });

  it("handles root path correctly", () => {
    expect(joinUrl("https://example.com", "/")).toBe("https://example.com/");
  });

  it("handles root path with trailing slash on base", () => {
    expect(joinUrl("https://example.com/", "/")).toBe("https://example.com/");
  });

  it("adds leading slash when path lacks one", () => {
    expect(joinUrl("https://example.com", "about")).toBe(
      "https://example.com/about",
    );
  });

  it("preserves deep paths", () => {
    expect(joinUrl("https://example.com", "/guides/dispatching")).toBe(
      "https://example.com/guides/dispatching",
    );
  });
});

describe("buildBreadcrumbSchema", () => {
  it("produces valid BreadcrumbList for a single item", () => {
    const result = buildBreadcrumbSchema(
      [{ label: "Home", href: "/" }],
      "https://example.com",
    );
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: { "@id": "https://example.com/", name: "Home" },
        },
      ],
    });
  });

  it("increments position for multiple items", () => {
    const result = buildBreadcrumbSchema(
      [
        { label: "Home", href: "/" },
        { label: "Blog", href: "/blog" },
        { label: "Post", href: "/blog/post" },
      ],
      "https://example.com",
    );
    expect(result["@type"]).toBe("BreadcrumbList");
    const items = result.itemListElement as {
      "@type": string;
      position: number;
      name: string;
      item: { "@id": string; name: string };
    }[];
    expect(items).toHaveLength(3);
    expect(items[0].position).toBe(1);
    expect(items[0].name).toBe("Home");
    expect(items[0].item).toEqual({
      "@id": "https://example.com/",
      name: "Home",
    });
    expect(items[1].position).toBe(2);
    expect(items[1].name).toBe("Blog");
    expect(items[1].item).toEqual({
      "@id": "https://example.com/blog",
      name: "Blog",
    });
    expect(items[2].position).toBe(3);
    expect(items[2].name).toBe("Post");
    expect(items[2].item).toEqual({
      "@id": "https://example.com/blog/post",
      name: "Post",
    });
  });

  it("includes required @context", () => {
    const result = buildBreadcrumbSchema(
      [{ label: "Home", href: "/" }],
      "https://example.com",
    );
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("constructs absolute URL by concatenating siteUrl and href", () => {
    const result = buildBreadcrumbSchema(
      [{ label: "Guides", href: "/guides/dispatching" }],
      "https://crewroute.com",
    );
    const items = result.itemListElement as {
      item: { "@id": string; name: string };
    }[];
    expect(items[0].item["@id"]).toBe(
      "https://crewroute.com/guides/dispatching",
    );
  });

  it("avoids double slashes when siteUrl has trailing slash", () => {
    const result = buildBreadcrumbSchema(
      [{ label: "About", href: "/about" }],
      "https://example.com/",
    );
    const items = result.itemListElement as {
      item: { "@id": string; name: string };
    }[];
    expect(items[0].item["@id"]).toBe("https://example.com/about");
  });
});

describe("buildFaqPageSchema", () => {
  it("produces valid FAQPage for a single FAQ", () => {
    const result = buildFaqPageSchema([{ q: "What?", a: "This." }]);
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What?",
          acceptedAnswer: { "@type": "Answer", text: "This." },
        },
      ],
    });
  });

  it("maps multiple FAQs correctly", () => {
    const result = buildFaqPageSchema([
      { q: "Q1?", a: "A1." },
      { q: "Q2?", a: "A2." },
    ]);
    expect(result["@type"]).toBe("FAQPage");
    const entities = result.mainEntity as {
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }[];
    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe("Q1?");
    expect(entities[0].acceptedAnswer.text).toBe("A1.");
    expect(entities[1].name).toBe("Q2?");
    expect(entities[1].acceptedAnswer.text).toBe("A2.");
  });

  it("includes required @context", () => {
    const result = buildFaqPageSchema([{ q: "Q?", a: "A." }]);
    expect(result["@context"]).toBe("https://schema.org");
  });
});

describe("buildArticleSchema", () => {
  const minimalOpts = {
    headline: "Test Article",
    description: "A test article description",
    datePublished: "2026-01-01",
    dateModified: "2026-01-15",
    publisher: { name: "CrewRoute" },
  };

  it("produces valid Article schema for minimal opts", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Test Article",
      description: "A test article description",
      datePublished: "2026-01-01",
      dateModified: "2026-01-15",
      inLanguage: "en",
      publisher: { "@type": "Organization", name: "CrewRoute" },
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: [".bluf-block"],
      },
    });
  });

  it("does not include author key when author is not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("author");
  });

  it("includes author with Person type when author name is provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane" },
    });
    expect(result.author).toEqual({ "@type": "Person", name: "Jane" });
  });

  it("includes author url when author has a url", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane", url: "https://jane.dev" },
    });
    expect(result.author).toEqual({
      "@type": "Person",
      name: "Jane",
      url: "https://jane.dev",
    });
  });

  it("does not include url in author when url is not provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane" },
    });
    const author = result.author as { url?: string };
    expect(author).not.toHaveProperty("url");
  });

  it("defaults speakable cssSelector to ['.bluf-block']", () => {
    const result = buildArticleSchema(minimalOpts);
    const speakable = result.speakable as {
      "@type": string;
      cssSelector: string[];
    };
    expect(speakable.cssSelector).toEqual([".bluf-block"]);
  });

  it("uses custom speakable selectors when provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      speakableCssSelectors: [".custom"],
    });
    const speakable = result.speakable as {
      "@type": string;
      cssSelector: string[];
    };
    expect(speakable.cssSelector).toEqual([".custom"]);
  });

  it("includes @context", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("includes publisher url when provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      publisher: { name: "CrewRoute", url: "https://crewroute.com" },
    });
    const publisher = result.publisher as {
      "@type": string;
      name: string;
      url?: string;
    };
    expect(publisher.url).toBe("https://crewroute.com");
  });

  it("emits publisher as @id reference when passed an @id string", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      publisher: { "@id": "https://example.com/#organization" },
    });
    expect(result.publisher).toEqual({
      "@id": "https://example.com/#organization",
    });
  });

  it("does not wrap @id publisher in an Organization node", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      publisher: { "@id": "https://example.com/#organization" },
    });
    const publisher = result.publisher as Record<string, unknown>;
    expect(publisher["@type"]).toBeUndefined();
    expect(publisher.name).toBeUndefined();
  });

  it("includes about entities in schema output when provided", () => {
    const about = [
      {
        "@type": "Thing",
        name: "HVAC Software",
        sameAs: "https://example.com/hvac",
      },
      { "@type": "SoftwareApplication", name: "FieldEdge" },
    ];
    const result = buildArticleSchema({ ...minimalOpts, about });
    expect(result.about).toEqual(about);
  });

  it("includes mentions entities in schema output when provided", () => {
    const mentions = [
      {
        "@type": "Organization",
        name: "ServiceTitan",
        sameAs: "https://servicetitan.com",
      },
    ];
    const result = buildArticleSchema({ ...minimalOpts, mentions });
    expect(result.mentions).toEqual(mentions);
  });

  it("omits about key when about is not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("about");
  });

  it("omits mentions key when mentions is not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("mentions");
  });

  it("omits about key when about is an empty array", () => {
    const result = buildArticleSchema({ ...minimalOpts, about: [] });
    expect(result).not.toHaveProperty("about");
  });

  it("omits mentions key when mentions is an empty array", () => {
    const result = buildArticleSchema({ ...minimalOpts, mentions: [] });
    expect(result).not.toHaveProperty("mentions");
  });

  it("includes both about and mentions when both are provided", () => {
    const about = [{ "@type": "Thing", name: "HVAC" }];
    const mentions = [{ "@type": "Organization", name: "Acme" }];
    const result = buildArticleSchema({ ...minimalOpts, about, mentions });
    expect(result.about).toEqual(about);
    expect(result.mentions).toEqual(mentions);
  });
});

describe("buildOrganizationSchema", () => {
  it("produces Organization schema with name and url", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
      url: "https://acme.com",
    });
  });

  it("includes founder with Person type when founder is provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      founder: { name: "Jane" },
    });
    expect(result.founder).toEqual({ "@type": "Person", name: "Jane" });
  });

  it("does not include founder key when founder is not provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("founder");
  });

  it("passes through enriched Person fields for founder", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      founder: {
        name: "Jane",
        url: "https://jane.dev",
        jobTitle: "CEO",
        sameAs: ["https://linkedin.com/in/jane"],
        credentials: "MBA",
      },
    });
    const founder = result.founder as Record<string, unknown>;
    expect(founder.url).toBe("https://jane.dev");
    expect(founder.jobTitle).toBe("CEO");
    expect(founder.sameAs).toEqual(["https://linkedin.com/in/jane"]);
    expect(founder.hasCredential).toBe("MBA");
  });

  it("includes areaServed string when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      areaServed: "US",
    });
    expect(result.areaServed).toBe("US");
  });

  it("includes areaServed array when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      areaServed: ["US", "CA", "MX"],
    });
    expect(result.areaServed).toEqual(["US", "CA", "MX"]);
  });

  it("omits areaServed key when not provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("areaServed");
  });
});

describe("buildProductSchema", () => {
  it("produces Product schema with Offer, strips non-numeric chars from price", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$149/mo" },
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Acme",
      description: "A tool",
      offers: { "@type": "Offer", price: "149", priceCurrency: "USD" },
    });
  });

  it("handles price of 0", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "0" },
    });
    const offers = result.offers as { price: string };
    expect(offers.price).toBe("0");
  });

  it("uses custom priceCurrency when provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$149/mo", priceCurrency: "EUR" },
    });
    const offers = result.offers as { priceCurrency: string };
    expect(offers.priceCurrency).toBe("EUR");
  });

  it("uses first offer when offers is an array (legacy: now produces AggregateOffer)", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$99/mo" }, { price: "$199/mo" }],
    });
    const offers = result.offers as { "@type": string; lowPrice: string };
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("99");
  });

  it("throws when offers is an empty array", () => {
    expect(() =>
      buildProductSchema({ name: "X", description: "Y", offers: [] }),
    ).toThrow("buildProductSchema: offers array must not be empty");
  });

  it("sets lowPrice === highPrice for a single numeric offer", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$49/mo" }],
    });
    const agg = result.offers as {
      "@type": string;
      lowPrice: string;
      highPrice: string;
      offerCount: number;
    };
    expect(agg["@type"]).toBe("AggregateOffer");
    expect(agg.offerCount).toBe(1);
    expect(agg.lowPrice).toBe("49");
    expect(agg.highPrice).toBe("49");
  });

  it("does not produce NaN in lowPrice/highPrice when offers include non-numeric prices", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "Free" }, { price: "$99/mo" }, { price: "Custom" }],
    });
    const agg = result.offers as {
      "@type": string;
      lowPrice?: string;
      highPrice?: string;
      offerCount: number;
    };
    expect(agg["@type"]).toBe("AggregateOffer");
    expect(agg.offerCount).toBe(3);
    expect(agg.lowPrice).toBe("99");
    expect(agg.highPrice).toBe("99");
  });

  it("omits lowPrice/highPrice when all offers have non-numeric prices", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "Free" }, { price: "Contact us" }],
    });
    const agg = result.offers as {
      "@type": string;
      lowPrice?: string;
      highPrice?: string;
      offerCount: number;
    };
    expect(agg["@type"]).toBe("AggregateOffer");
    expect(agg.offerCount).toBe(2);
    expect(agg).not.toHaveProperty("lowPrice");
    expect(agg).not.toHaveProperty("highPrice");
  });

  it("includes homepage-enrichment fields when provided", () => {
    const result = buildProductSchema({
      name: "Floriva",
      description: "A privacy-first period tracker",
      url: "https://floriva.app/",
      image: "https://floriva.app/og-default.png",
      category: "Privacy-First Period Tracker",
      brand: { name: "Floriva" },
      offers: { price: "$2.99/mo", url: "https://floriva.app/#pricing" },
    });
    expect(result.url).toBe("https://floriva.app/");
    expect(result.image).toBe("https://floriva.app/og-default.png");
    expect(result.category).toBe("Privacy-First Period Tracker");
    expect(result.brand).toEqual({ "@type": "Brand", name: "Floriva" });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.url).toBe("https://floriva.app/#pricing");
  });

  it("uses AggregateOffer when software offers include multiple tiers", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: [
        { price: "$10/mo", url: "https://acme.com/pricing/" },
        { price: "$27/mo", url: "https://acme.com/pricing/" },
        { price: "$50/mo", url: "https://acme.com/pricing/" },
      ],
    });

    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("10");
    expect(offers.highPrice).toBe("50");
    expect(offers.offerCount).toBe(3);
    expect(offers.offers).toEqual([
      {
        "@type": "Offer",
        price: "10",
        priceCurrency: "USD",
        url: "https://acme.com/pricing/",
      },
      {
        "@type": "Offer",
        price: "27",
        priceCurrency: "USD",
        url: "https://acme.com/pricing/",
      },
      {
        "@type": "Offer",
        price: "50",
        priceCurrency: "USD",
        url: "https://acme.com/pricing/",
      },
    ]);
  });

  it("throws when software offers array is empty", () => {
    expect(() =>
      buildSoftwareApplicationSchema({
        name: "Acme",
        description: "A tool",
        offers: [],
      }),
    ).toThrow("buildSoftwareApplicationSchema: offers array must not be empty");
  });

  it("keeps AggregateOffer valid when software offer prices are non-numeric", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "Custom" }, { price: "Call for pricing" }],
    });

    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.priceCurrency).toBe("USD");
    expect(offers.offerCount).toBe(2);
    expect(offers).not.toHaveProperty("lowPrice");
    expect(offers).not.toHaveProperty("highPrice");
  });

  it("preserves software offer currency and availability in AggregateOffer items", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: [
        {
          price: "10",
          priceCurrency: "CAD",
          availability: "https://schema.org/InStock",
        },
      ],
    });

    const offers = result.offers as { offers: Record<string, unknown>[] };
    expect(offers.offers[0]).toMatchObject({
      "@type": "Offer",
      price: "10",
      priceCurrency: "CAD",
      availability: "https://schema.org/InStock",
    });
  });
});

describe("buildSoftwareApplicationSchema", () => {
  it("produces SoftwareApplication schema with defaults", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "149" },
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Acme",
      description: "A tool",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      offers: { "@type": "Offer", price: "149", priceCurrency: "USD" },
    });
  });

  it("accepts custom applicationCategory", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "0" },
      applicationCategory: "UtilitiesApplication",
    });
    expect(result.applicationCategory).toBe("UtilitiesApplication");
  });

  it("accepts custom operatingSystem", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "0" },
      operatingSystem: "Web",
    });
    expect(result.operatingSystem).toBe("Web");
  });

  it("strips non-numeric chars from price", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$149/mo" },
    });
    const offers = result.offers as { price: string };
    expect(offers.price).toBe("149");
  });

  it("uses AggregateOffer for price ranges", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$20-$99/mo" },
    });
    const offers = result.offers as {
      "@type": string;
      lowPrice: string;
      highPrice: string;
      priceCurrency: string;
    };
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("20");
    expect(offers.highPrice).toBe("99");
    expect(offers.priceCurrency).toBe("USD");
  });

  it("includes homepage-enrichment fields when provided", () => {
    const result = buildSoftwareApplicationSchema({
      name: "Floriva",
      description: "A privacy-first period tracker",
      url: "https://floriva.app/",
      image: "https://floriva.app/og-default.png",
      brand: { name: "Floriva" },
      featureList: [
        "On-device storage only",
        "No account required",
        "Encrypted sync",
      ],
      applicationCategory: "HealthApplication",
      operatingSystem: "iOS, Android",
      offers: { price: "$2.99/mo", url: "https://floriva.app/#pricing" },
    });
    expect(result.url).toBe("https://floriva.app/");
    expect(result.image).toBe("https://floriva.app/og-default.png");
    expect(result.brand).toEqual({ "@type": "Brand", name: "Floriva" });
    expect(result.featureList).toEqual([
      "On-device storage only",
      "No account required",
      "Encrypted sync",
    ]);
    const offers = result.offers as Record<string, unknown>;
    expect(offers.url).toBe("https://floriva.app/#pricing");
  });
});

describe("buildItemListSchema", () => {
  it("produces ItemList with a single item at position 1", () => {
    const result = buildItemListSchema([
      { name: "Tool A", description: "Desc A" },
    ]);
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Tool A",
          description: "Desc A",
        },
      ],
    });
  });

  it("increments position for multiple items", () => {
    const result = buildItemListSchema([
      { name: "Tool A", description: "Desc A" },
      { name: "Tool B", description: "Desc B" },
    ]);
    const items = result.itemListElement as {
      position: number;
      name: string;
    }[];
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
  });

  it("includes url in ListItem when provided", () => {
    const result = buildItemListSchema([
      { name: "Tool A", description: "Desc A", url: "https://tool-a.com" },
    ]);
    const items = result.itemListElement as { url?: string }[];
    expect(items[0].url).toBe("https://tool-a.com");
  });

  it("omits url from ListItem when not provided", () => {
    const result = buildItemListSchema([{ name: "Tool A" }]);
    const items = result.itemListElement as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty("url");
  });
});

describe("buildHowToSchema", () => {
  it("produces HowTo schema with a single step at position 1", () => {
    const result = buildHowToSchema({
      name: "How to X",
      description: "Learn X",
      steps: [{ title: "Step 1", content: "Do this" }],
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to X",
      description: "Learn X",
      step: [
        { "@type": "HowToStep", position: 1, name: "Step 1", text: "Do this" },
      ],
    });
  });

  it("increments position for multiple steps", () => {
    const result = buildHowToSchema({
      name: "How to X",
      description: "Learn X",
      steps: [
        { title: "Step 1", content: "Do this" },
        { title: "Step 2", content: "Then this" },
      ],
    });
    const steps = result.step as { position: number }[];
    expect(steps[0].position).toBe(1);
    expect(steps[1].position).toBe(2);
  });
});

describe("buildArticleSchema enrichments", () => {
  const minimalOpts = {
    headline: "Test Article",
    description: "A test article description",
    datePublished: "2026-01-01",
    dateModified: "2026-01-15",
    publisher: { name: "CrewRoute" },
  };

  it("includes inLanguage: 'en' by default (backward-compatible addition)", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result.inLanguage).toBe("en");
  });

  it("overrides inLanguage when provided", () => {
    const result = buildArticleSchema({ ...minimalOpts, inLanguage: "es" });
    expect(result.inLanguage).toBe("es");
  });

  it("includes image when provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      image: "https://example.com/img.jpg",
    });
    expect(result.image).toBe("https://example.com/img.jpg");
  });

  it("does not include image key when not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("image");
  });

  it("includes mainEntityOfPage as WebPage object when provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      mainEntityOfPage: "https://example.com/page",
    });
    expect(result.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://example.com/page",
    });
  });

  it("does not include mainEntityOfPage when not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("mainEntityOfPage");
  });

  it("includes lastReviewed when provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      lastReviewed: "2026-03-20",
    });
    expect(result.lastReviewed).toBe("2026-03-20");
  });

  it("does not include lastReviewed when not provided", () => {
    const result = buildArticleSchema(minimalOpts);
    expect(result).not.toHaveProperty("lastReviewed");
  });
});

describe("buildArticleSchema author enrichments", () => {
  const minimalOpts = {
    headline: "Test Article",
    description: "A test article description",
    datePublished: "2026-01-01",
    dateModified: "2026-01-15",
    publisher: { name: "CrewRoute" },
  };

  it("includes jobTitle in Person when author has jobTitle", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane", jobTitle: "CEO" },
    });
    const author = result.author as Record<string, unknown>;
    expect(author.jobTitle).toBe("CEO");
  });

  it("includes sameAs in Person when author has sameAs", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane", sameAs: ["https://linkedin.com/in/jane"] },
    });
    const author = result.author as Record<string, unknown>;
    expect(author.sameAs).toEqual(["https://linkedin.com/in/jane"]);
  });

  it("includes hasCredential in Person when author has credentials", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane", credentials: "PhD" },
    });
    const author = result.author as Record<string, unknown>;
    expect(author.hasCredential).toBe("PhD");
  });

  it("does not include jobTitle/sameAs/hasCredential when not provided", () => {
    const result = buildArticleSchema({
      ...minimalOpts,
      author: { name: "Jane" },
    });
    const author = result.author as Record<string, unknown>;
    expect(author).not.toHaveProperty("jobTitle");
    expect(author).not.toHaveProperty("sameAs");
    expect(author).not.toHaveProperty("hasCredential");
  });
});

describe("buildOrganizationSchema enrichments", () => {
  it("includes sameAs when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      sameAs: ["https://twitter.com/acme"],
    });
    expect(result.sameAs).toEqual(["https://twitter.com/acme"]);
  });

  it("does not include sameAs when not provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("sameAs");
  });

  it("includes contactPoint as ContactPoint schema when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      contactPoint: { type: "customer service", email: "help@acme.com" },
    });
    expect(result.contactPoint).toEqual({
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "help@acme.com",
    });
  });

  it("includes contactPoint url when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      contactPoint: { type: "sales", url: "https://acme.com/contact" },
    });
    const cp = result.contactPoint as Record<string, unknown>;
    expect(cp.url).toBe("https://acme.com/contact");
  });

  it("does not include contactPoint when not provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("contactPoint");
  });

  it("backward compatible: output without new fields matches original structure", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
      url: "https://acme.com",
    });
  });

  it("includes logo as ImageObject when provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
      logo: "https://acme.com/logo-light.svg",
    });
    expect(result.logo).toEqual({
      "@type": "ImageObject",
      url: "https://acme.com/logo-light.svg",
    });
  });

  it("does not include logo when not provided", () => {
    const result = buildOrganizationSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("logo");
  });
});

describe("buildProductSchema AggregateOffer enrichments", () => {
  it("single offer (non-array) still produces Offer type", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$49/mo" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe("49");
  });

  it("array of offers produces AggregateOffer with lowPrice, highPrice, offerCount", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$49/mo" }, { price: "$149/mo" }, { price: "$299/mo" }],
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("49");
    expect(offers.highPrice).toBe("299");
    expect(offers.offerCount).toBe(3);
  });

  it("AggregateOffer contains individual Offer objects", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$49/mo" }, { price: "$149/mo" }, { price: "$299/mo" }],
    });
    const offers = result.offers as Record<string, unknown>;
    const nested = offers.offers as Record<string, unknown>[];
    expect(nested).toHaveLength(3);
    expect(nested[0]).toEqual({
      "@type": "Offer",
      price: "49",
      priceCurrency: "USD",
    });
    expect(nested[1]).toEqual({
      "@type": "Offer",
      price: "149",
      priceCurrency: "USD",
    });
    expect(nested[2]).toEqual({
      "@type": "Offer",
      price: "299",
      priceCurrency: "USD",
    });
  });

  it("includes brand when provided", () => {
    const result = buildProductSchema({
      name: "CrewRoute",
      description: "A tool",
      offers: { price: "$49/mo" },
      brand: { name: "CrewRoute" },
    });
    expect(result.brand).toEqual({ "@type": "Brand", name: "CrewRoute" });
  });

  it("does not include brand when not provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$49/mo" },
    });
    expect(result).not.toHaveProperty("brand");
  });

  it("single Offer includes availability when provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: {
        price: "$49/mo",
        availability: "https://schema.org/InStock",
      },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.availability).toBe("https://schema.org/InStock");
  });

  it("single Offer includes url when provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$49/mo", url: "https://acme.com/buy" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.url).toBe("https://acme.com/buy");
  });

  it("single Offer omits availability when not provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$49/mo" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers).not.toHaveProperty("availability");
  });

  it("single Offer omits url when not provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$49/mo" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers).not.toHaveProperty("url");
  });

  it("AggregateOffer inner Offer includes availability when provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [
        { price: "$49/mo", availability: "https://schema.org/InStock" },
        { price: "$99/mo" },
      ],
    });
    const aggregateOffer = result.offers as Record<string, unknown>;
    const nested = aggregateOffer.offers as Record<string, unknown>[];
    expect(nested[0].availability).toBe("https://schema.org/InStock");
    expect(nested[1]).not.toHaveProperty("availability");
  });

  it("AggregateOffer inner Offer includes url when provided", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [
        { price: "$49/mo", url: "https://acme.com/starter" },
        { price: "$99/mo" },
      ],
    });
    const aggregateOffer = result.offers as Record<string, unknown>;
    const nested = aggregateOffer.offers as Record<string, unknown>[];
    expect(nested[0].url).toBe("https://acme.com/starter");
    expect(nested[1]).not.toHaveProperty("url");
  });

  it("preserves decimal points in prices", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$9.99/mo" }, { price: "$14.95/mo" }],
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.lowPrice).toBe("9.99");
    expect(offers.highPrice).toBe("14.95");
    const nested = offers.offers as Record<string, unknown>[];
    expect(nested[0]).toEqual({
      "@type": "Offer",
      price: "9.99",
      priceCurrency: "USD",
    });
    expect(nested[1]).toEqual({
      "@type": "Offer",
      price: "14.95",
      priceCurrency: "USD",
    });
  });
});

describe("buildSearchActionSchema", () => {
  it("produces SearchAction with EntryPoint target and query-input (no @context)", () => {
    const result = buildSearchActionSchema({
      siteUrl: "https://acme.com",
      searchPathTemplate: "/search?q={search_term_string}",
    });
    expect(result).toEqual({
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://acme.com/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    });
  });

  it("does NOT have @context (must be embedded in WebSite)", () => {
    const result = buildSearchActionSchema({
      siteUrl: "https://acme.com",
      searchPathTemplate: "/search?q={search_term_string}",
    });
    expect(result).not.toHaveProperty("@context");
  });

  it("concatenates siteUrl and searchPathTemplate", () => {
    const result = buildSearchActionSchema({
      siteUrl: "https://example.com",
      searchPathTemplate: "/find?s={search_term_string}",
    });
    const target = result.target as Record<string, unknown>;
    expect(target.urlTemplate).toBe(
      "https://example.com/find?s={search_term_string}",
    );
  });

  it("avoids double slashes when siteUrl has trailing slash", () => {
    const result = buildSearchActionSchema({
      siteUrl: "https://example.com/",
      searchPathTemplate: "/search?q={search_term_string}",
    });
    const target = result.target as Record<string, unknown>;
    expect(target.urlTemplate).toBe(
      "https://example.com/search?q={search_term_string}",
    );
  });
});

describe("buildWebSiteSchema", () => {
  it("produces minimal WebSite schema with name and url", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Acme",
      url: "https://acme.com",
    });
  });

  it("includes description when provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
      description: "A great tool",
    });
    expect(result.description).toBe("A great tool");
  });

  it("does not include description when not provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("description");
  });

  it("includes potentialAction when searchAction is provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
      searchAction: {
        siteUrl: "https://acme.com",
        searchPathTemplate: "/search?q={search_term_string}",
      },
    });
    const action = result.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(action["query-input"]).toBe("required name=search_term_string");
  });

  it("embedded SearchAction in potentialAction does not have @context", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
      searchAction: {
        siteUrl: "https://acme.com",
        searchPathTemplate: "/search?q={search_term_string}",
      },
    });
    const action = result.potentialAction as Record<string, unknown>;
    expect(action).not.toHaveProperty("@context");
  });

  it("does not include potentialAction when searchAction is not provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("potentialAction");
  });

  it("includes publisher with @id when publisherId is provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
      publisherId: "https://acme.com/#organization",
    });
    expect(result.publisher).toEqual({
      "@id": "https://acme.com/#organization",
    });
  });

  it("does not include publisher when publisherId is not provided", () => {
    const result = buildWebSiteSchema({
      name: "Acme",
      url: "https://acme.com",
    });
    expect(result).not.toHaveProperty("publisher");
  });
});

describe("buildReviewSchema", () => {
  const minimalOpts = {
    quote: "Great software for dispatching",
    name: "John Doe",
    reviewOf: "CrewRoute",
  };

  it("produces @type: Review with reviewBody, author, itemReviewed", () => {
    const result = buildReviewSchema(minimalOpts);
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Review");
    expect(result.reviewBody).toBe("Great software for dispatching");
    expect(result).toHaveProperty("author");
    expect(result).toHaveProperty("itemReviewed");
  });

  it("author has @type: Person and name", () => {
    const result = buildReviewSchema(minimalOpts);
    const author = result.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Person");
    expect(author.name).toBe("John Doe");
  });

  it("with title: includes jobTitle on author", () => {
    const result = buildReviewSchema({
      ...minimalOpts,
      title: "Operations Manager",
    });
    const author = result.author as Record<string, unknown>;
    expect(author.jobTitle).toBe("Operations Manager");
  });

  it("without title: no jobTitle on author", () => {
    const result = buildReviewSchema(minimalOpts);
    const author = result.author as Record<string, unknown>;
    expect(author).not.toHaveProperty("jobTitle");
  });

  it("with rating: includes reviewRating with ratingValue and bestRating: 5", () => {
    const result = buildReviewSchema({ ...minimalOpts, rating: 4 });
    const reviewRating = result.reviewRating as Record<string, unknown>;
    expect(reviewRating["@type"]).toBe("Rating");
    expect(reviewRating.ratingValue).toBe(4);
    expect(reviewRating.bestRating).toBe(5);
  });

  it("without rating: no reviewRating key", () => {
    const result = buildReviewSchema(minimalOpts);
    expect(result).not.toHaveProperty("reviewRating");
  });

  it("itemReviewed is @type: SoftwareApplication with the reviewOf name", () => {
    const result = buildReviewSchema(minimalOpts);
    const itemReviewed = result.itemReviewed as Record<string, unknown>;
    expect(itemReviewed["@type"]).toBe("SoftwareApplication");
    expect(itemReviewed.name).toBe("CrewRoute");
  });
});

describe("buildGeoArticleSchema", () => {
  const minimalOpts = {
    title: "HVAC Software in Texas",
    description: "Top HVAC solutions for Texas contractors",
    state: "Texas",
  };

  it("produces @type: Article with headline, description, about", () => {
    const result = buildGeoArticleSchema(minimalOpts);
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Article");
    expect(result.headline).toBe("HVAC Software in Texas");
    expect(result).not.toHaveProperty("name");
    expect(result.description).toBe("Top HVAC solutions for Texas contractors");
    expect(result).toHaveProperty("about");
  });

  it("passes validateSchema (Article requires headline)", () => {
    const result = buildGeoArticleSchema(minimalOpts) as Record<
      string,
      unknown
    >;
    const validation = validateSchema(result);
    expect(validation.errors).not.toContain("Article requires headline");
  });

  it("about has @type: State with state name", () => {
    const result = buildGeoArticleSchema(minimalOpts);
    const about = result.about as Record<string, unknown>;
    expect(about["@type"]).toBe("State");
    expect(about.name).toBe("Texas");
  });

  it("about.containedInPlace has @type: Country, default United States", () => {
    const result = buildGeoArticleSchema(minimalOpts);
    const about = result.about as Record<string, unknown>;
    const country = about.containedInPlace as Record<string, unknown>;
    expect(country["@type"]).toBe("Country");
    expect(country.name).toBe("United States");
  });

  it("custom country overrides default", () => {
    const result = buildGeoArticleSchema({ ...minimalOpts, country: "Canada" });
    const about = result.about as Record<string, unknown>;
    const country = about.containedInPlace as Record<string, unknown>;
    expect(country.name).toBe("Canada");
  });

  it("includes author Person when author is provided", () => {
    const result = buildGeoArticleSchema({
      ...minimalOpts,
      author: {
        name: "Angel Campa",
        jobTitle: "Founder",
        url: "https://www.linkedin.com/in/angelcampa1/",
        sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
      },
    });

    expect(result.author).toEqual({
      "@type": "Person",
      name: "Angel Campa",
      jobTitle: "Founder",
      url: "https://www.linkedin.com/in/angelcampa1/",
      sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
    });
  });
});

describe("buildStatisticCitationSchema", () => {
  it("returns @context: 'https://schema.org'", () => {
    const result = buildStatisticCitationSchema({
      stat: "70% of HVAC companies use spreadsheets",
      source: "IBISWorld",
      sourceUrl: "https://ibisworld.com",
    });
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("returns @type: 'Quotation'", () => {
    const result = buildStatisticCitationSchema({
      stat: "70% of HVAC companies use spreadsheets",
      source: "IBISWorld",
      sourceUrl: "https://ibisworld.com",
    });
    expect(result["@type"]).toBe("Quotation");
  });

  it("maps stat to text field", () => {
    const result = buildStatisticCitationSchema({
      stat: "70% of HVAC companies use spreadsheets",
      source: "IBISWorld",
      sourceUrl: "https://ibisworld.com",
    });
    expect(result.text).toBe("70% of HVAC companies use spreadsheets");
  });

  it("with sourceUrl: citation has @type WebPage, url, and name", () => {
    const result = buildStatisticCitationSchema({
      stat: "70% of HVAC companies use spreadsheets",
      source: "IBISWorld",
      sourceUrl: "https://ibisworld.com",
    });
    expect(result.citation).toEqual({
      "@type": "WebPage",
      url: "https://ibisworld.com",
      name: "IBISWorld",
    });
  });

  it("without sourceUrl: citation has @type WebPage and name but no url", () => {
    const result = buildStatisticCitationSchema({
      stat: "70% of HVAC companies use spreadsheets",
      source: "IBISWorld",
    });
    const citation = result.citation as Record<string, unknown>;
    expect(citation["@type"]).toBe("WebPage");
    expect(citation.name).toBe("IBISWorld");
    expect(citation).not.toHaveProperty("url");
  });

  it("produces a complete valid schema object with sourceUrl", () => {
    const result = buildStatisticCitationSchema({
      stat: "Field service market worth $5.1B",
      source: "Statista",
      sourceUrl: "https://statista.com/field-service",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Quotation",
      text: "Field service market worth $5.1B",
      citation: {
        "@type": "WebPage",
        url: "https://statista.com/field-service",
        name: "Statista",
      },
    });
  });

  it("produces a complete valid schema object without sourceUrl", () => {
    const result = buildStatisticCitationSchema({
      stat: "Field service market worth $5.1B",
      source: "Statista",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Quotation",
      text: "Field service market worth $5.1B",
      citation: {
        "@type": "WebPage",
        name: "Statista",
      },
    });
  });
});

describe("buildPriceSpecificationSchema", () => {
  it("returns @type: 'AggregateOffer'", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: ["Dispatch"] },
    ]);
    expect(result["@type"]).toBe("AggregateOffer");
  });

  it("returns @context: 'https://schema.org'", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: ["Dispatch"] },
    ]);
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("offerCount matches tiers array length", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: ["Dispatch"] },
      { name: "Pro", price: "$99/mo", features: ["Dispatch", "Reporting"] },
      { name: "Enterprise", price: "$199/mo", features: ["All features"] },
    ]);
    expect(result.offerCount).toBe(3);
  });

  it("each offer has @type: 'Offer', name, and description", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: ["Dispatch", "Invoicing"] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(1);
    expect(offers[0]["@type"]).toBe("Offer");
    expect(offers[0].name).toBe("Starter");
    expect(offers[0].description).toBe("Dispatch, Invoicing");
  });

  it("extracts numeric price from '$49/mo' and sets priceCurrency: 'USD'", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: [] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0].price).toBe("49");
    expect(offers[0].priceCurrency).toBe("USD");
  });

  it("extracts decimal price from '$149.99/month'", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Pro", price: "$149.99/month", features: [] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0].price).toBe("149.99");
    expect(offers[0].priceCurrency).toBe("USD");
  });

  it("omits price and priceCurrency when price is 'Contact sales'", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Enterprise", price: "Contact sales", features: ["Custom"] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0]).not.toHaveProperty("price");
    expect(offers[0]).not.toHaveProperty("priceCurrency");
  });

  it("omits price and priceCurrency when price contains no digits", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Custom", price: "Call us", features: [] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0]).not.toHaveProperty("price");
    expect(offers[0]).not.toHaveProperty("priceCurrency");
  });

  it("empty tiers array returns offerCount: 0 and offers: []", () => {
    const result = buildPriceSpecificationSchema([]);
    expect(result.offerCount).toBe(0);
    expect(result.offers).toEqual([]);
  });

  it("maps multiple tiers to separate Offer entries in order", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: ["Basic"] },
      { name: "Pro", price: "$99/mo", features: ["Advanced", "API"] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[0].name).toBe("Starter");
    expect(offers[1].name).toBe("Pro");
  });

  it("description joins multiple features with', '", () => {
    const result = buildPriceSpecificationSchema([
      {
        name: "Pro",
        price: "$99/mo",
        features: ["Dispatch", "Invoicing", "Reporting"],
      },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0].description).toBe("Dispatch, Invoicing, Reporting");
  });

  it("description is empty string when features array is empty", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: [] },
    ]);
    const offers = result.offers as Record<string, unknown>[];
    expect(offers[0].description).toBe("");
  });

  it("all-numeric tiers: top-level lowPrice is min, highPrice is max, priceCurrency is USD", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: [] },
      { name: "Pro", price: "$99/mo", features: [] },
      { name: "Enterprise", price: "$199/mo", features: [] },
    ]);
    expect(result.lowPrice).toBe("49");
    expect(result.highPrice).toBe("199");
    expect(result.priceCurrency).toBe("USD");
  });

  it("mixed tiers: lowPrice/highPrice derived from numeric-only subset", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Starter", price: "$49/mo", features: [] },
      { name: "Enterprise", price: "Contact sales", features: [] },
    ]);
    expect(result.lowPrice).toBe("49");
    expect(result.highPrice).toBe("49");
    expect(result.priceCurrency).toBe("USD");
  });

  it("all non-numeric tiers: lowPrice, highPrice, priceCurrency absent from result", () => {
    const result = buildPriceSpecificationSchema([
      { name: "Enterprise", price: "Contact sales", features: [] },
      { name: "Custom", price: "Call us", features: [] },
    ]);
    expect(result).not.toHaveProperty("lowPrice");
    expect(result).not.toHaveProperty("highPrice");
    expect(result).not.toHaveProperty("priceCurrency");
  });
});

describe("buildDefinedTermSchema", () => {
  it("returns @context: 'https://schema.org'", () => {
    const result = buildDefinedTermSchema({
      term: "Field Service",
      definition: "Work performed at a customer location.",
    });
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("returns @type: 'DefinedTerm'", () => {
    const result = buildDefinedTermSchema({
      term: "Field Service",
      definition: "Work performed at a customer location.",
    });
    expect(result["@type"]).toBe("DefinedTerm");
  });

  it("name field equals the term argument", () => {
    const result = buildDefinedTermSchema({
      term: "Dispatch",
      definition: "The act of sending a technician to a job site.",
    });
    expect(result.name).toBe("Dispatch");
  });

  it("description field equals the definition argument", () => {
    const result = buildDefinedTermSchema({
      term: "Dispatch",
      definition: "The act of sending a technician to a job site.",
    });
    expect(result.description).toBe(
      "The act of sending a technician to a job site.",
    );
  });
});

// Bug 2: AggregateOffer must include priceCurrency
describe("buildProductSchema AggregateOffer priceCurrency", () => {
  it("AggregateOffer includes priceCurrency: 'USD' when offers is an array", () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "$49/mo" }, { price: "$149/mo" }],
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.priceCurrency).toBe("USD");
  });

  it("AggregateOffer priceCurrency is present even when all prices are non-numeric (no lowPrice/highPrice)", () => {
    // When all prices are non-numeric, lowPrice/highPrice are absent but priceCurrency still present
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "Contact sales" }, { price: "Custom" }],
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.priceCurrency).toBe("USD");
  });
});

// Bug 10: Non-numeric prices produce empty price in Schema.org
describe("stripNonNumeric via buildSoftwareApplicationSchema", () => {
  it('price "Free" produces "0" (not empty string)', () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "Free" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.price).toBe("0");
  });

  it('price "Custom" produces "0"', () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "Custom" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.price).toBe("0");
  });

  it('price "$149/mo" still produces "149"', () => {
    const result = buildSoftwareApplicationSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "$149/mo" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.price).toBe("149");
  });
});

describe("buildProductSchema single offer with non-numeric price", () => {
  it('single offer with price "Free" gets price "0"', () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: { price: "Free" },
    });
    const offers = result.offers as Record<string, unknown>;
    expect(offers.price).toBe("0");
  });

  it('array offer with price "Free" gets price "0"', () => {
    const result = buildProductSchema({
      name: "Acme",
      description: "A tool",
      offers: [{ price: "Free" }],
    });
    const agg = result.offers as Record<string, unknown>;
    const innerOffers = agg.offers as Record<string, unknown>[];
    expect(innerOffers[0].price).toBe("0");
  });
});

describe("mergeFaqSources", () => {
  it("returns undefined when both primary and secondary are empty", () => {
    expect(mergeFaqSources([], [])).toBeUndefined();
  });

  it("returns FAQPage schema from primary items only", () => {
    const result = mergeFaqSources([{ q: "What is X?", a: "X is Y." }], []);
    expect(result).toBeDefined();
    expect(result!["@type"]).toBe("FAQPage");
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("What is X?");
  });

  it("returns FAQPage schema from secondary items only", () => {
    const result = mergeFaqSources(
      [],
      [{ question: "How does Y work?", answer: "Y works by Z." }],
    );
    expect(result).toBeDefined();
    expect(result!["@type"]).toBe("FAQPage");
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("How does Y work?");
  });

  it("merges primary and secondary items", () => {
    const result = mergeFaqSources(
      [{ q: "What is A?", a: "A is B." }],
      [{ question: "What is C?", answer: "C is D." }],
    );
    expect(result).toBeDefined();
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe("What is A?");
    expect(entities[1].name).toBe("What is C?");
  });

  it("deduplicates by question text (case-insensitive)", () => {
    const result = mergeFaqSources(
      [{ q: "What is X?", a: "Primary answer." }],
      [{ question: "WHAT IS X?", answer: "Secondary answer." }],
    );
    expect(result).toBeDefined();
    const entities = result!.mainEntity as { name: string }[];
    // duplicate removed -- primary wins
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("What is X?");
  });

  it("deduplicates case-insensitively with surrounding whitespace", () => {
    const result = mergeFaqSources(
      [{ q: "  What is X?", a: "Primary answer." }],
      [{ question: "what is x?", answer: "Secondary answer." }],
    );
    expect(result).toBeDefined();
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(1);
  });

  it("returns correct @context on the FAQPage schema", () => {
    const result = mergeFaqSources([{ q: "What is X?", a: "X is Y." }], []);
    expect(result!["@context"]).toBe("https://schema.org");
  });

  it("includes acceptedAnswer for each entity", () => {
    const result = mergeFaqSources(
      [{ q: "Q1?", a: "A1." }],
      [{ question: "Q2?", answer: "A2." }],
    );
    const entities = result!.mainEntity as {
      "@type": string;
      acceptedAnswer: { "@type": string; text: string };
    }[];
    expect(entities[0]["@type"]).toBe("Question");
    expect(entities[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(entities[0].acceptedAnswer.text).toBe("A1.");
    expect(entities[1].acceptedAnswer.text).toBe("A2.");
  });

  it("keeps non-duplicate secondary items when mixed duplicates and uniques", () => {
    const result = mergeFaqSources(
      [
        { q: "Shared question?", a: "Primary answer." },
        { q: "Only in primary?", a: "Primary only." },
      ],
      [
        { question: "SHARED QUESTION?", answer: "Secondary duplicate." },
        { question: "Only in secondary?", answer: "Secondary only." },
      ],
    );
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(3);
    const names = entities.map((e) => e.name);
    expect(names).toContain("Shared question?");
    expect(names).toContain("Only in primary?");
    expect(names).toContain("Only in secondary?");
  });

  it("deduplicates within the primary array itself", () => {
    const primary = [
      { q: "What is this?", a: "Answer 1" },
      { q: "What is this?", a: "Answer 1 duplicate" },
    ];
    const result = mergeFaqSources(primary, []);
    const faqPage = result as Record<string, unknown>;
    const questions = faqPage.mainEntity as unknown[];
    expect(questions).toHaveLength(1);
  });

  it("primary faqs win when same question exists in both primary faqs and secondary answers", () => {
    // Layout scenario: faqs from frontmatter (primary) + answers from AnswerBlocks (secondary)
    const primaryFaqs = [
      { q: "How does pricing work?", a: "Primary FAQ answer." },
    ];
    const secondaryAnswers = [
      {
        question: "How does pricing work?",
        answer: "AnswerBlock answer -- should be discarded.",
      },
      {
        question: "What integrations are supported?",
        answer: "AnswerBlock-only answer.",
      },
    ];
    const result = mergeFaqSources(primaryFaqs, secondaryAnswers);
    expect(result).toBeDefined();
    const entities = result!.mainEntity as {
      name: string;
      acceptedAnswer: { text: string };
    }[];
    expect(entities).toHaveLength(2);
    // Primary FAQ answer wins for the shared question
    const pricingEntry = entities.find(
      (e) => e.name === "How does pricing work?",
    );
    expect(pricingEntry).toBeDefined();
    expect(pricingEntry!.acceptedAnswer.text).toBe("Primary FAQ answer.");
    // AnswerBlock-only entry is still included
    const integrationsEntry = entities.find(
      (e) => e.name === "What integrations are supported?",
    );
    expect(integrationsEntry).toBeDefined();
  });

  it("emits a single FAQPage @type when both primary faqs and secondary answers are provided", () => {
    // Regression guard: ensure no duplicate FAQPage types -- only one @type: FAQPage
    const result = mergeFaqSources(
      [{ q: "Q from faqs?", a: "A from faqs." }],
      [{ question: "Q from answers?", answer: "A from answers." }],
    );
    expect(result!["@type"]).toBe("FAQPage");
    // mainEntity contains both questions merged into a single schema
    const entities = result!.mainEntity as { name: string }[];
    expect(entities).toHaveLength(2);
  });
});

describe("buildCollectionPageSchema", () => {
  it("returns a CollectionPage schema with required fields and no mainEntity when items are omitted", () => {
    const result = buildCollectionPageSchema({
      name: "HVAC Software Hub",
      description: "Compare HVAC dispatch software",
      url: "https://example.com/hvac-software",
    }) as Record<string, unknown>;

    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("CollectionPage");
    expect(result.name).toBe("HVAC Software Hub");
    expect(result.description).toBe("Compare HVAC dispatch software");
    expect(result.url).toBe("https://example.com/hvac-software");
    expect(result.mainEntity).toBeUndefined();
  });

  it("returns a CollectionPage schema with mainEntity ItemList when items are provided", () => {
    const result = buildCollectionPageSchema({
      name: "Alternatives Hub",
      description: "Top alternatives to popular software",
      url: "https://example.com/alternatives",
      items: [
        {
          name: "ServiceTitan Alternative",
          description: "Best pick",
          url: "https://example.com/st",
        },
        {
          name: "Jobber Alternative",
          description: "Runner up",
          url: "https://example.com/jb",
        },
      ],
    }) as Record<string, unknown>;

    expect(result["@type"]).toBe("CollectionPage");
    const mainEntity = result.mainEntity as Record<string, unknown>;
    expect(mainEntity["@type"]).toBe("ItemList");
    const elements = mainEntity.itemListElement as Record<string, unknown>[];
    expect(elements).toHaveLength(2);

    expect(elements[0]["@type"]).toBe("ListItem");
    expect(elements[0].position).toBe(1);
    expect(elements[0].name).toBe("ServiceTitan Alternative");
    expect(elements[0].description).toBe("Best pick");
    expect(elements[0].url).toBe("https://example.com/st");

    expect(elements[1]["@type"]).toBe("ListItem");
    expect(elements[1].position).toBe(2);
    expect(elements[1].name).toBe("Jobber Alternative");
  });

  it("does NOT include mainEntity when items is an empty array", () => {
    const result = buildCollectionPageSchema({
      name: "Empty Hub",
      description: "No items yet",
      url: "https://example.com/empty",
      items: [],
    }) as Record<string, unknown>;

    expect(result.mainEntity).toBeUndefined();
  });

  it("handles a single item correctly with position 1", () => {
    const result = buildCollectionPageSchema({
      name: "Single Item Hub",
      description: "Only one item",
      url: "https://example.com/single",
      items: [{ name: "Only Item", url: "https://example.com/only" }],
    }) as Record<string, unknown>;

    const mainEntity = result.mainEntity as Record<string, unknown>;
    const elements = mainEntity.itemListElement as Record<string, unknown>[];
    expect(elements).toHaveLength(1);
    expect(elements[0].position).toBe(1);
    expect(elements[0].name).toBe("Only Item");
  });

  it("includes description and url on items that have them", () => {
    const result = buildCollectionPageSchema({
      name: "Hub",
      description: "Desc",
      url: "https://example.com",
      items: [
        {
          name: "Item A",
          description: "An item",
          url: "https://example.com/a",
        },
      ],
    }) as Record<string, unknown>;

    const mainEntity = result.mainEntity as Record<string, unknown>;
    const elements = mainEntity.itemListElement as Record<string, unknown>[];
    expect(elements[0].description).toBe("An item");
    expect(elements[0].url).toBe("https://example.com/a");
  });

  it("omits description and url keys when they are undefined on an item", () => {
    const result = buildCollectionPageSchema({
      name: "Hub",
      description: "Desc",
      url: "https://example.com",
      items: [{ name: "Bare Item" }],
    }) as Record<string, unknown>;

    const mainEntity = result.mainEntity as Record<string, unknown>;
    const elements = mainEntity.itemListElement as Record<string, unknown>[];
    expect(
      Object.prototype.hasOwnProperty.call(elements[0], "description"),
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(elements[0], "url")).toBe(
      false,
    );
  });
});

describe("buildPageIdentityGraphSchemas", () => {
  it("connects Organization, WebSite, WebPage, and BreadcrumbList nodes", () => {
    const result = buildPageIdentityGraphSchemas({
      siteName: "Gavelhouse",
      siteUrl: "https://gavelhouse.app",
      pageUrl: "https://gavelhouse.app/resources/guides/example/",
      pageName: "Example Guide",
      pageDescription: "Guide description",
      breadcrumbs: [
        { label: "Resources", href: "/resources/" },
        { label: "Example Guide", href: "/resources/guides/example/" },
      ],
      author: { name: "Angel Campa" },
    });

    expect(result.map((schema) => schema["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebPage",
      "BreadcrumbList",
    ]);
    expect(result[0]["@id"]).toBe("https://gavelhouse.app/#organization");
    expect(result[1]).toMatchObject({
      "@id": "https://gavelhouse.app/#website",
      publisher: { "@id": "https://gavelhouse.app/#organization" },
    });
    expect(result[2]).toMatchObject({
      "@id": "https://gavelhouse.app/resources/guides/example/#webpage",
      url: "https://gavelhouse.app/resources/guides/example/",
      isPartOf: { "@id": "https://gavelhouse.app/#website" },
      publisher: { "@id": "https://gavelhouse.app/#organization" },
    });
    expect(result[3]["@id"]).toBe(
      "https://gavelhouse.app/resources/guides/example/#breadcrumb",
    );
  });
});

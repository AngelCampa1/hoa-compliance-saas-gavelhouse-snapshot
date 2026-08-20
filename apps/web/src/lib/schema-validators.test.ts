import { describe, it, expect } from "vitest";
import { isJsonLdSchema, validateSchema } from "./schema-validators";

describe("isJsonLdSchema", () => {
  it("returns true for valid JSON-LD schema", () => {
    expect(
      isJsonLdSchema({ "@context": "https://schema.org", "@type": "Article" }),
    ).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isJsonLdSchema({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isJsonLdSchema(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isJsonLdSchema(undefined)).toBe(false);
  });

  it("returns false for object with unrelated keys", () => {
    expect(isJsonLdSchema({ foo: "bar" })).toBe(false);
  });

  it("returns false when @context is missing", () => {
    expect(isJsonLdSchema({ "@type": "Article" })).toBe(false);
  });

  it("returns false when @type is missing", () => {
    expect(isJsonLdSchema({ "@context": "https://schema.org" })).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isJsonLdSchema([])).toBe(false);
  });

  it("returns false for non-schema.org @context", () => {
    expect(
      isJsonLdSchema({ "@context": "https://example.com", "@type": "Article" }),
    ).toBe(false);
  });
});

describe("validateSchema", () => {
  it("returns error when @context is missing", () => {
    const result = validateSchema({ "@type": "Article" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing @context");
  });

  it("returns error when @type is missing", () => {
    const result = validateSchema({ "@context": "https://schema.org" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing @type");
  });

  it("returns errors for both missing @context and @type", () => {
    const result = validateSchema({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing @context");
    expect(result.errors).toContain("Missing @type");
  });

  describe("Article", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "Article",
    };

    it("returns error when headline is missing", () => {
      const result = validateSchema({
        ...base,
        datePublished: "2026-01-01",
        dateModified: "2026-01-01",
        publisher: { name: "Test" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Article requires headline");
    });

    it("returns error when datePublished is missing", () => {
      const result = validateSchema({
        ...base,
        headline: "Test",
        dateModified: "2026-01-01",
        publisher: { name: "Test" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Article requires datePublished");
    });

    it("returns error when dateModified is missing", () => {
      const result = validateSchema({
        ...base,
        headline: "Test",
        datePublished: "2026-01-01",
        publisher: { name: "Test" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Article requires dateModified");
    });

    it("returns error when publisher is missing", () => {
      const result = validateSchema({
        ...base,
        headline: "Test",
        datePublished: "2026-01-01",
        dateModified: "2026-01-01",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Article requires publisher");
    });

    it("returns valid when all required fields are present", () => {
      const result = validateSchema({
        ...base,
        headline: "Test Article",
        datePublished: "2026-01-01",
        dateModified: "2026-01-02",
        publisher: { name: "Test Publisher" },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("FAQPage", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
    };

    it("returns error when mainEntity is missing", () => {
      const result = validateSchema({ ...base });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("FAQPage requires mainEntity");
    });

    it("returns error when mainEntity is an empty array", () => {
      const result = validateSchema({ ...base, mainEntity: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("FAQPage requires mainEntity");
    });

    it("returns valid when mainEntity has items", () => {
      const result = validateSchema({
        ...base,
        mainEntity: [
          {
            "@type": "Question",
            name: "Q?",
            acceptedAnswer: { "@type": "Answer", text: "A." },
          },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("BreadcrumbList", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
    };

    it("returns error when itemListElement is missing", () => {
      const result = validateSchema({ ...base });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "BreadcrumbList requires itemListElement",
      );
    });

    it("returns error when itemListElement is empty", () => {
      const result = validateSchema({ ...base, itemListElement: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "BreadcrumbList requires itemListElement",
      );
    });

    it("returns valid when itemListElement has items", () => {
      const result = validateSchema({
        ...base,
        itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("ItemList", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "ItemList",
    };

    it("returns error when itemListElement is missing", () => {
      const result = validateSchema({ ...base });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("ItemList requires itemListElement");
    });

    it("returns error when itemListElement is empty", () => {
      const result = validateSchema({ ...base, itemListElement: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("ItemList requires itemListElement");
    });

    it("returns valid when itemListElement has items", () => {
      const result = validateSchema({
        ...base,
        itemListElement: [{ "@type": "ListItem", position: 1, name: "Item 1" }],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("HowTo", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "HowTo",
    };

    it("returns error when name is missing", () => {
      const result = validateSchema({
        ...base,
        step: [{ "@type": "HowToStep", text: "Do it" }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("HowTo requires name");
    });

    it("returns error when step is missing", () => {
      const result = validateSchema({ ...base, name: "How to do something" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("HowTo requires step");
    });

    it("returns error when step is an empty array", () => {
      const result = validateSchema({
        ...base,
        name: "How to do something",
        step: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("HowTo requires step");
    });

    it("returns valid with name and non-empty step", () => {
      const result = validateSchema({
        ...base,
        name: "How to do something",
        step: [{ "@type": "HowToStep", text: "Do it" }],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("Organization", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "Organization",
    };

    it("returns error when name is missing", () => {
      const result = validateSchema({ ...base, url: "https://example.com" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Organization requires name");
    });

    it("returns error when url is missing", () => {
      const result = validateSchema({ ...base, name: "Acme Corp" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Organization requires url");
    });

    it("returns valid with name and url", () => {
      const result = validateSchema({
        ...base,
        name: "Acme Corp",
        url: "https://example.com",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("Product", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "Product",
    };

    it("returns error when name is missing", () => {
      const result = validateSchema({ ...base, offers: { price: "9.99" } });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Product requires name");
    });

    it("returns error when offers is missing", () => {
      const result = validateSchema({ ...base, name: "Widget" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Product requires offers");
    });

    it("returns valid with name and offers", () => {
      const result = validateSchema({
        ...base,
        name: "Widget",
        offers: { price: "9.99" },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("SoftwareApplication", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
    };

    it("returns error when name is missing", () => {
      const result = validateSchema({ ...base, offers: { price: "0" } });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("SoftwareApplication requires name");
    });

    it("returns error when offers is missing", () => {
      const result = validateSchema({ ...base, name: "My App" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("SoftwareApplication requires offers");
    });

    it("returns valid with name and offers", () => {
      const result = validateSchema({
        ...base,
        name: "My App",
        offers: { price: "0" },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("WebSite", () => {
    const base = {
      "@context": "https://schema.org",
      "@type": "WebSite",
    };

    it("returns error when name is missing", () => {
      const result = validateSchema({ ...base, url: "https://example.com" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("WebSite requires name");
    });

    it("returns error when url is missing", () => {
      const result = validateSchema({ ...base, name: "My Site" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("WebSite requires url");
    });

    it("returns valid with name and url", () => {
      const result = validateSchema({
        ...base,
        name: "My Site",
        url: "https://example.com",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("unknown @type", () => {
    it("returns valid for unknown type with no type-specific validation", () => {
      const result = validateSchema({
        "@context": "https://schema.org",
        "@type": "Event",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("missing @context with present @type", () => {
    it("reports both Missing @context AND type-specific errors in one pass", () => {
      const result = validateSchema({ "@type": "Article" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing @context");
      expect(result.errors).toContain("Article requires headline");
    });

    it("reports Missing @context along with FAQPage requires mainEntity", () => {
      const result = validateSchema({ "@type": "FAQPage" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing @context");
      expect(result.errors).toContain("FAQPage requires mainEntity");
    });

    it("reports Missing @context along with Organization errors", () => {
      const result = validateSchema({ "@type": "Organization" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing @context");
      expect(result.errors).toContain("Organization requires name");
      expect(result.errors).toContain("Organization requires url");
    });
  });
});

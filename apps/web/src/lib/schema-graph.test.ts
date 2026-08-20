import { describe, it, expect } from "vitest";
import { buildGraph, withId, refId } from "./schema-graph";

describe("buildGraph", () => {
  it("wraps schemas in @context and @graph", () => {
    const schema = { "@type": "Article", name: "Test" };
    const result = buildGraph([schema]);
    expect(result["@context"]).toBe("https://schema.org");
    expect(Array.isArray(result["@graph"])).toBe(true);
  });

  it("strips @context from each schema item", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      name: "Test",
    };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]).not.toHaveProperty("@context");
    expect(graph[0]["@type"]).toBe("Article");
    expect(graph[0]["name"]).toBe("Test");
  });

  it("strips @context from multiple schemas", () => {
    const schemas = [
      { "@context": "https://schema.org", "@type": "Article", name: "A" },
      { "@context": "https://schema.org", "@type": "Person", name: "B" },
    ];
    const result = buildGraph(schemas);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph).toHaveLength(2);
    expect(graph[0]).not.toHaveProperty("@context");
    expect(graph[1]).not.toHaveProperty("@context");
    expect(graph[0]["@type"]).toBe("Article");
    expect(graph[1]["@type"]).toBe("Person");
  });

  it("throws when passed an empty array", () => {
    expect(() => buildGraph([])).toThrow(
      "buildGraph: schemas array must not be empty",
    );
  });

  it("passes through schemas that have no @context", () => {
    const schema = { "@type": "Organization", name: "Acme" };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]).toEqual({ "@type": "Organization", name: "Acme" });
  });

  it("preserves existing @id on schemas", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://example.com/#website",
    };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]["@id"]).toBe("https://example.com/#website");
    expect(graph[0]).not.toHaveProperty("@context");
  });

  it("does not mutate the input schemas", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      name: "Original",
    };
    buildGraph([schema]);
    expect(schema["@context"]).toBe("https://schema.org");
  });

  it("returns an object with exactly @context and @graph keys at root", () => {
    const result = buildGraph([{ "@type": "Thing" }]);
    const keys = Object.keys(result);
    expect(keys).toContain("@context");
    expect(keys).toContain("@graph");
    expect(keys).toHaveLength(2);
  });
});

describe("withId", () => {
  it("returns a new object with @id added", () => {
    const schema = { "@type": "Article", name: "Test" };
    const result = withId(schema, "https://example.com/#article");
    expect(result["@id"]).toBe("https://example.com/#article");
    expect(result["@type"]).toBe("Article");
    expect(result["name"]).toBe("Test");
  });

  it("does not mutate the original schema", () => {
    const schema: Record<string, unknown> = { "@type": "Article" };
    withId(schema, "https://example.com/#article");
    expect(schema).not.toHaveProperty("@id");
  });

  it("overwrites @id if already present", () => {
    const schema = { "@type": "Article", "@id": "https://example.com/#old" };
    const result = withId(schema, "https://example.com/#new");
    expect(result["@id"]).toBe("https://example.com/#new");
  });

  it("preserves all other properties", () => {
    const schema = {
      "@type": "Person",
      name: "Jane",
      url: "https://example.com/jane",
    };
    const result = withId(schema, "https://example.com/#jane");
    expect(result).toMatchObject(schema);
    expect(result["@id"]).toBe("https://example.com/#jane");
  });
});

describe("refId", () => {
  it("returns an object with @id property", () => {
    const result = refId("https://example.com/#article");
    expect(result).toEqual({ "@id": "https://example.com/#article" });
  });

  it("returns only the @id key", () => {
    const result = refId("https://example.com/#org");
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["@id"]).toBe("https://example.com/#org");
  });
});

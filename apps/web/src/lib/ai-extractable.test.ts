import { describe, it, expect } from "vitest";
import {
  buildAnswerSchema,
  validateAnswerLength,
  buildExpertQuoteSchema,
  buildProsConsData,
  buildProsConsSchema,
  buildProsConsReviewSchema,
  buildTableSchema,
  buildComparisonTableSchema,
  parseStatValue,
} from "./ai-extractable";

// ─── 6a: Answer block utils ────────────────────────────────────────────────

describe("buildAnswerSchema", () => {
  it("produces a Question schema with acceptedAnswer", () => {
    const result = buildAnswerSchema({
      question: "What is X?",
      answer: "X is a thing.",
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Question",
      name: "What is X?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "X is a thing.",
      },
    });
  });

  it("sets @context to https://schema.org", () => {
    const result = buildAnswerSchema({ question: "Q?", answer: "A." });
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("sets @type to Question", () => {
    const result = buildAnswerSchema({ question: "Q?", answer: "A." });
    expect(result["@type"]).toBe("Question");
  });

  it("maps question to name and answer to acceptedAnswer.text", () => {
    const result = buildAnswerSchema({
      question: "How does it work?",
      answer: "It works by doing stuff.",
    });
    expect(result.name).toBe("How does it work?");
    const accepted = result.acceptedAnswer as { "@type": string; text: string };
    expect(accepted.text).toBe("It works by doing stuff.");
    expect(accepted["@type"]).toBe("Answer");
  });
});

describe("validateAnswerLength", () => {
  it("returns valid:true and correct wordCount for 50 words", () => {
    const text = Array(50).fill("word").join(" ");
    expect(validateAnswerLength(text)).toEqual({ valid: true, wordCount: 50 });
  });

  it("returns valid:false for 20 words", () => {
    const text = Array(20).fill("word").join(" ");
    expect(validateAnswerLength(text)).toEqual({ valid: false, wordCount: 20 });
  });

  it("returns valid:false for 70 words", () => {
    const text = Array(70).fill("word").join(" ");
    expect(validateAnswerLength(text)).toEqual({ valid: false, wordCount: 70 });
  });

  it("returns valid:true for exactly 40 words (lower edge)", () => {
    const text = Array(40).fill("word").join(" ");
    expect(validateAnswerLength(text)).toEqual({ valid: true, wordCount: 40 });
  });

  it("returns valid:true for exactly 60 words (upper edge)", () => {
    const text = Array(60).fill("word").join(" ");
    expect(validateAnswerLength(text)).toEqual({ valid: true, wordCount: 60 });
  });

  it("filters empty strings when splitting on whitespace", () => {
    // extra spaces produce empty strings -- should still count only real words
    const text = "  one  two  three";
    expect(validateAnswerLength(text)).toEqual({ valid: false, wordCount: 3 });
  });
});

// ─── 6b: Expert quote utils ────────────────────────────────────────────────

describe("buildExpertQuoteSchema", () => {
  it("produces a Quotation schema with creator", () => {
    const result = buildExpertQuoteSchema({
      quote: "quote text",
      person: { name: "Jane Doe", jobTitle: "CEO" },
    });
    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Quotation",
      text: "quote text",
      creator: {
        "@type": "Person",
        name: "Jane Doe",
        jobTitle: "CEO",
      },
    });
  });

  it("includes worksFor when organization is provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "quote text",
      person: { name: "Jane Doe", jobTitle: "CEO", organization: "Acme" },
    });
    const creator = result.creator as {
      "@type": string;
      name: string;
      jobTitle: string;
      worksFor?: { "@type": string; name: string };
    };
    expect(creator.worksFor).toEqual({ "@type": "Organization", name: "Acme" });
  });

  it("omits worksFor when organization is not provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "quote text",
      person: { name: "Jane Doe" },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator["worksFor"]).toBeUndefined();
  });

  it("omits jobTitle from Person when not provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "quote text",
      person: { name: "Jane Doe" },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator["jobTitle"]).toBeUndefined();
  });

  it("sets @context and @type correctly", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: { name: "N" },
    });
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Quotation");
  });
});

// ─── 6c: Pros/cons utils ───────────────────────────────────────────────────

describe("buildProsConsData", () => {
  it("maps pros to positiveNotes and cons to negativeNotes", () => {
    const result = buildProsConsData({
      subject: "X",
      pros: ["fast"],
      cons: ["expensive"],
    });
    expect(result).toEqual({
      subject: "X",
      positiveNotes: ["fast"],
      negativeNotes: ["expensive"],
    });
  });

  it("handles empty pros array", () => {
    const result = buildProsConsData({
      subject: "Y",
      pros: [],
      cons: ["slow"],
    });
    expect(result.positiveNotes).toEqual([]);
    expect(result.negativeNotes).toEqual(["slow"]);
  });

  it("handles empty cons array", () => {
    const result = buildProsConsData({
      subject: "Z",
      pros: ["cheap"],
      cons: [],
    });
    expect(result.positiveNotes).toEqual(["cheap"]);
    expect(result.negativeNotes).toEqual([]);
  });

  it("preserves subject as-is", () => {
    const result = buildProsConsData({
      subject: "My Tool",
      pros: [],
      cons: [],
    });
    expect(result.subject).toBe("My Tool");
  });
});

// ─── 6c-2: Pros/cons schema ────────────────────────────────────────────────

describe("buildProsConsSchema", () => {
  it("produces an ItemList schema with pros and cons as ListItems", () => {
    const result = buildProsConsSchema({
      subject: "Tool X",
      pros: ["fast", "cheap"],
      cons: ["ugly"],
    });
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("ItemList");
    expect(result.name).toBe("Pros and cons of Tool X");
    const items = result.itemListElement as {
      position: number;
      name: string;
      description: string;
    }[];
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      position: 1,
      name: "fast",
      description: "Pro",
    });
    expect(items[1]).toMatchObject({
      position: 2,
      name: "cheap",
      description: "Pro",
    });
    expect(items[2]).toMatchObject({
      position: 3,
      name: "ugly",
      description: "Con",
    });
  });

  it("handles empty pros", () => {
    const result = buildProsConsSchema({
      subject: "Y",
      pros: [],
      cons: ["bad"],
    });
    const items = result.itemListElement as { position: number }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      position: 1,
      name: "bad",
      description: "Con",
    });
  });

  it("handles empty cons", () => {
    const result = buildProsConsSchema({
      subject: "Z",
      pros: ["good"],
      cons: [],
    });
    const items = result.itemListElement as { position: number }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      position: 1,
      name: "good",
      description: "Pro",
    });
  });
});

// ─── 6d: Data table utils ──────────────────────────────────────────────────

describe("buildTableSchema", () => {
  it("produces a Table schema with name", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Table",
      name: "Pricing",
    });
  });

  it("uses Table @type (not ItemList)", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result["@type"]).toBe("Table");
  });

  it("does not emit rows property", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result).not.toHaveProperty("rows");
  });

  it("emits machine-readable table columns and rows in a schema.org-safe payload", () => {
    const result = buildTableSchema({
      name: "Pricing",
      description: "Our plan tiers",
      columns: ["Plan", "Price"],
      rows: [
        ["Starter", "$29/mo"],
        ["Growth", "$79/mo"],
      ],
    });

    expect(result.variableMeasured).toEqual(["Plan", "Price"]);
    const encodedRows = JSON.stringify([
      { Plan: "Starter", Price: "$29/mo" },
      { Plan: "Growth", Price: "$79/mo" },
    ]);

    expect(result.hasPart).toEqual([
      {
        "@type": "Dataset",
        name: "Pricing table data",
        variableMeasured: ["Plan", "Price"],
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "application/json",
          text: encodedRows,
        },
      },
    ]);
    expect(JSON.parse(encodedRows)).toEqual([
      { Plan: "Starter", Price: "$29/mo" },
      { Plan: "Growth", Price: "$79/mo" },
    ]);
    expect(JSON.stringify(result)).not.toContain('"data"');
  });

  it("does not emit about property", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result).not.toHaveProperty("about");
  });

  it("includes description when provided", () => {
    const result = buildTableSchema({
      name: "Pricing",
      description: "Our plan tiers",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result.description).toBe("Our plan tiers");
  });

  it("omits description when not provided", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result["description"]).toBeUndefined();
  });

  it("does not emit itemListElement property", () => {
    const result = buildTableSchema({
      name: "X",
      columns: ["A", "B"],
      rows: [["1"]],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("does not emit itemListElement even with multiple rows", () => {
    const result = buildTableSchema({
      name: "X",
      columns: ["A", "B"],
      rows: [["1", "2"], ["only-one"], ["x", "y", "z"]],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("sets @context and @type correctly", () => {
    const result = buildTableSchema({
      name: "T",
      columns: ["C"],
      rows: [["v"]],
    });
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Table");
  });
});

// ─── 6d-2: buildTableSchema -- no itemListElement ───────────────────────────

describe("buildTableSchema -- no itemListElement", () => {
  it("does not emit itemListElement on a single-row table", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price"],
      rows: [["Free", "$0"]],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("does not emit itemListElement on a multi-row table", () => {
    const result = buildTableSchema({
      name: "Pricing",
      columns: ["Plan", "Price", "Users"],
      rows: [
        ["Free", "$0", "1"],
        ["Pro", "$49", "10"],
      ],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("does not emit itemListElement when rows is empty", () => {
    const result = buildTableSchema({
      name: "Empty",
      columns: ["A", "B"],
      rows: [],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("does not emit itemListElement for a single-column single-row table", () => {
    const result = buildTableSchema({
      name: "Single",
      columns: ["Name"],
      rows: [["Alice"]],
    });
    expect(result).not.toHaveProperty("itemListElement");
  });

  it("schema has only expected top-level keys", () => {
    const result = buildTableSchema({
      name: "T",
      description: "desc",
      columns: ["C"],
      rows: [["v"]],
    });
    const keys = Object.keys(result);
    expect(keys).toContain("@context");
    expect(keys).toContain("@type");
    expect(keys).toContain("name");
    expect(keys).toContain("description");
    expect(keys).toContain("variableMeasured");
    expect(keys).toContain("hasPart");
    expect(keys).not.toContain("itemListElement");
  });
});

// ─── Change A: buildComparisonTableSchema ──────────────────────────────────

describe("buildComparisonTableSchema", () => {
  it("produces a Table schema with name", () => {
    const result = buildComparisonTableSchema({ name: "Tool Comparison" });
    expect(result).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Table",
      name: "Tool Comparison",
    });
  });

  it("sets @context to https://schema.org", () => {
    const result = buildComparisonTableSchema({ name: "X" });
    expect(result["@context"]).toBe("https://schema.org");
  });

  it("sets @type to Table", () => {
    const result = buildComparisonTableSchema({ name: "X" });
    expect(result["@type"]).toBe("Table");
  });

  it("includes description when provided", () => {
    const result = buildComparisonTableSchema({
      name: "Tool Comparison",
      description: "Best picks for 2025",
    });
    expect(result.description).toBe("Best picks for 2025");
  });

  it("omits description when not provided", () => {
    const result = buildComparisonTableSchema({ name: "Tool Comparison" });
    expect(result["description"]).toBeUndefined();
  });

  it("does not emit extra properties", () => {
    const result = buildComparisonTableSchema({ name: "T" });
    const keys = Object.keys(result);
    expect(keys).toContain("@context");
    expect(keys).toContain("@type");
    expect(keys).toContain("name");
    expect(keys).not.toContain("rows");
    expect(keys).not.toContain("itemListElement");
    expect(keys).not.toContain("columns");
  });

  it("schema has only expected top-level keys when description is present", () => {
    const result = buildComparisonTableSchema({
      name: "T",
      description: "desc",
    });
    const keys = Object.keys(result);
    expect(keys).toEqual(["@context", "@type", "name", "description"]);
  });
});

// ─── Change B: buildProsConsReviewSchema ───────────────────────────────────

describe("buildProsConsReviewSchema", () => {
  it("produces a Review schema with itemReviewed and author", () => {
    const result = buildProsConsReviewSchema({
      subject: "Acme Tool",
      pros: ["fast"],
      cons: ["expensive"],
    });
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Review");
  });

  it("sets itemReviewed to SoftwareApplication with subject name", () => {
    const result = buildProsConsReviewSchema({
      subject: "Acme Tool",
      pros: ["fast"],
      cons: ["expensive"],
    });
    const itemReviewed = result.itemReviewed as {
      "@type": string;
      name: string;
    };
    expect(itemReviewed["@type"]).toBe("SoftwareApplication");
    expect(itemReviewed.name).toBe("Acme Tool");
  });

  it("defaults author to Editorial Team Organization", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: [],
      cons: [],
    });
    const author = result.author as { "@type": string; name: string };
    expect(author["@type"]).toBe("Organization");
    expect(author.name).toBe("Editorial Team");
  });

  it("uses provided reviewerName as author name", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: [],
      cons: [],
      reviewerName: "Tech Editors",
    });
    const author = result.author as { "@type": string; name: string };
    expect(author.name).toBe("Tech Editors");
  });

  it("uses provided reviewer Person details as schema author", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: [],
      cons: [],
      reviewer: {
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

  it("maps pros to positiveNotes ItemList with ListItems", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: ["fast", "cheap"],
      cons: [],
    });
    const positiveNotes = result.positiveNotes as {
      "@type": string;
      itemListElement: { "@type": string; position: number; name: string }[];
    };
    expect(positiveNotes["@type"]).toBe("ItemList");
    expect(positiveNotes.itemListElement).toHaveLength(2);
    expect(positiveNotes.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "fast",
    });
    expect(positiveNotes.itemListElement[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "cheap",
    });
  });

  it("maps cons to negativeNotes ItemList with ListItems", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: [],
      cons: ["slow", "buggy"],
    });
    const negativeNotes = result.negativeNotes as {
      "@type": string;
      itemListElement: { "@type": string; position: number; name: string }[];
    };
    expect(negativeNotes["@type"]).toBe("ItemList");
    expect(negativeNotes.itemListElement).toHaveLength(2);
    expect(negativeNotes.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "slow",
    });
    expect(negativeNotes.itemListElement[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "buggy",
    });
  });

  it("handles empty pros and cons", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: [],
      cons: [],
    });
    const positiveNotes = result.positiveNotes as {
      itemListElement: unknown[];
    };
    const negativeNotes = result.negativeNotes as {
      itemListElement: unknown[];
    };
    expect(positiveNotes.itemListElement).toHaveLength(0);
    expect(negativeNotes.itemListElement).toHaveLength(0);
  });

  it("positions in positiveNotes and negativeNotes are both independently 1-based", () => {
    const result = buildProsConsReviewSchema({
      subject: "Tool",
      pros: ["a", "b"],
      cons: ["x", "y"],
    });
    const positiveNotes = result.positiveNotes as {
      itemListElement: { position: number }[];
    };
    const negativeNotes = result.negativeNotes as {
      itemListElement: { position: number }[];
    };
    expect(positiveNotes.itemListElement[0].position).toBe(1);
    expect(positiveNotes.itemListElement[1].position).toBe(2);
    expect(negativeNotes.itemListElement[0].position).toBe(1);
    expect(negativeNotes.itemListElement[1].position).toBe(2);
  });
});

// ─── Change C (E-E-A-T): buildExpertQuoteSchema with url + sameAs ──────────

describe("buildExpertQuoteSchema -- E-E-A-T url + sameAs", () => {
  it("includes url on creator when provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: { name: "Jane", url: "https://jane.example.com" },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator.url).toBe("https://jane.example.com");
  });

  it("includes sameAs on creator when provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: {
        name: "Jane",
        sameAs: ["https://twitter.com/jane", "https://linkedin.com/in/jane"],
      },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator.sameAs).toEqual([
      "https://twitter.com/jane",
      "https://linkedin.com/in/jane",
    ]);
  });

  it("omits url from creator when not provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: { name: "Jane" },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator["url"]).toBeUndefined();
  });

  it("omits sameAs from creator when not provided", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: { name: "Jane" },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator["sameAs"]).toBeUndefined();
  });

  it("can combine url, sameAs, jobTitle, and organization together", () => {
    const result = buildExpertQuoteSchema({
      quote: "q",
      person: {
        name: "Jane",
        jobTitle: "CTO",
        organization: "Acme",
        url: "https://jane.example.com",
        sameAs: ["https://twitter.com/jane"],
      },
    });
    const creator = result.creator as Record<string, unknown>;
    expect(creator.jobTitle).toBe("CTO");
    expect(creator.worksFor).toEqual({
      "@type": "Organization",
      name: "Acme",
    });
    expect(creator.url).toBe("https://jane.example.com");
    expect(creator.sameAs).toEqual(["https://twitter.com/jane"]);
  });
});

// ─── 6e: parseStatValue ────────────────────────────────────────────────────

describe("parseStatValue", () => {
  it('extracts numeric string from "2,100 establishments"', () => {
    expect(parseStatValue("2,100 establishments")).toBe("2100");
  });

  it('extracts numeric string from "42%"', () => {
    expect(parseStatValue("42%")).toBe("42");
  });

  it('extracts numeric string from "$149/mo"', () => {
    expect(parseStatValue("$149/mo")).toBe("149");
  });

  it("falls back to raw string when no digits found", () => {
    expect(parseStatValue("hello")).toBe("hello");
  });

  it('preserves decimal point: "3.14"', () => {
    expect(parseStatValue("3.14")).toBe("3.14");
  });

  it("removes extra decimal points, keeping only the first", () => {
    expect(parseStatValue("3.5.2")).toBe("3.52");
  });

  it("handles version-like strings with multiple dots", () => {
    expect(parseStatValue("v1.2.3")).toBe("1.23");
  });

  it("handles string with trailing dot after strip", () => {
    expect(parseStatValue("10.")).toBe("10.");
  });
});

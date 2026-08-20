import { describe, it, expect } from "vitest";
import {
  buildLlmsTxt,
  buildLlmsTxtSections,
  type LlmsTxtManifestSection,
  type LlmsTxtOptions,
  type LlmsTxtSection,
  type LlmsTxtItem,
} from "./llms-txt";

describe("buildLlmsTxt", () => {
  const baseOpts: LlmsTxtOptions = {
    name: "CrewRoute",
    description: "Dispatch software for small HVAC contractors",
    overview: "CrewRoute helps owner-operators manage dispatch and scheduling.",
    sections: [
      {
        heading: "Alternatives",
        items: [
          {
            title: "CrewRoute vs ServiceTitan",
            url: "https://crewroute.app/compare/alternatives/servicetitan",
            description:
              "Side-by-side comparison of CrewRoute and ServiceTitan",
          },
        ],
      },
    ],
  };

  it("starts with a markdown h1 of the name", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toMatch(/^# CrewRoute\n/);
  });

  it("includes the description as a blockquote", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toContain("> Dispatch software for small HVAC contractors");
  });

  it("includes the overview paragraph", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toContain(
      "CrewRoute helps owner-operators manage dispatch and scheduling.",
    );
  });

  it("includes key machine-readable links before content sections", () => {
    const result = buildLlmsTxt({
      ...baseOpts,
      keyLinks: {
        heading: "Machine-readable files",
        items: [
          {
            title: "Pricing data",
            url: "https://crewroute.app/pricing.txt",
            description: "Plan prices and billing terms.",
          },
        ],
      },
    });

    expect(result).toContain("## Machine-readable files");
    expect(result.indexOf("## Machine-readable files")).toBeLessThan(
      result.indexOf("## Alternatives"),
    );
    expect(result).toContain(
      "- [Pricing data](https://crewroute.app/pricing.txt): Plan prices and billing terms.",
    );
  });

  it("includes section headings as h2", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toContain("## Alternatives");
  });

  it("formats items as markdown links with descriptions", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toContain(
      "- [CrewRoute vs ServiceTitan](https://crewroute.app/compare/alternatives/servicetitan): Side-by-side comparison of CrewRoute and ServiceTitan",
    );
  });

  it("renders multiple sections with multiple items", () => {
    const opts: LlmsTxtOptions = {
      name: "TestSite",
      description: "A test site",
      sections: [
        {
          heading: "Guides",
          items: [
            {
              title: "Guide A",
              url: "https://test.com/a",
              description: "First guide",
            },
            {
              title: "Guide B",
              url: "https://test.com/b",
              description: "Second guide",
            },
          ],
        },
        {
          heading: "Comparisons",
          items: [
            {
              title: "X vs Y",
              url: "https://test.com/x-vs-y",
              description: "Compare X and Y",
            },
          ],
        },
      ],
    };
    const result = buildLlmsTxt(opts);
    expect(result).toContain("## Guides");
    expect(result).toContain("- [Guide A](https://test.com/a): First guide");
    expect(result).toContain("- [Guide B](https://test.com/b): Second guide");
    expect(result).toContain("## Comparisons");
    expect(result).toContain(
      "- [X vs Y](https://test.com/x-vs-y): Compare X and Y",
    );
  });

  it("omits sections with zero items", () => {
    const opts: LlmsTxtOptions = {
      name: "TestSite",
      description: "A test site",
      sections: [
        { heading: "Empty Section", items: [] },
        {
          heading: "Has Items",
          items: [
            {
              title: "Item",
              url: "https://test.com/item",
              description: "An item",
            },
          ],
        },
      ],
    };
    const result = buildLlmsTxt(opts);
    expect(result).not.toContain("## Empty Section");
    expect(result).toContain("## Has Items");
  });

  it("handles missing overview gracefully", () => {
    const opts: LlmsTxtOptions = {
      name: "TestSite",
      description: "A test site",
      sections: [
        {
          heading: "Section",
          items: [
            {
              title: "Item",
              url: "https://test.com/item",
              description: "Desc",
            },
          ],
        },
      ],
    };
    const result = buildLlmsTxt(opts);
    expect(result).toContain("# TestSite");
    expect(result).toContain("> A test site");
    expect(result).toContain("## Section");
    // Should not have double blank lines where overview would be
    expect(result).not.toContain("\n\n\n\n");
  });

  it("handles single item section", () => {
    const opts: LlmsTxtOptions = {
      name: "Solo",
      description: "One item site",
      sections: [
        {
          heading: "Only",
          items: [
            {
              title: "Single",
              url: "https://solo.com/single",
              description: "The only item",
            },
          ],
        },
      ],
    };
    const result = buildLlmsTxt(opts);
    const lines = result.split("\n");
    const itemLines = lines.filter((l) => l.startsWith("- ["));
    expect(itemLines).toHaveLength(1);
  });

  it("preserves special characters in titles and descriptions", () => {
    const opts: LlmsTxtOptions = {
      name: "Test & Demo",
      description: 'Site with "special" chars & more',
      overview: "Prices start at $99/mo -- really!",
      sections: [
        {
          heading: "Tools & Resources",
          items: [
            {
              title: 'Item with "quotes" & ampersands',
              url: "https://test.com/special?foo=bar&baz=1",
              description: "Description with <html> & special chars",
            },
          ],
        },
      ],
    };
    const result = buildLlmsTxt(opts);
    expect(result).toContain("# Test & Demo");
    expect(result).toContain('> Site with "special" chars & more');
    expect(result).toContain("Prices start at $99/mo -- really!");
    expect(result).toContain('Item with "quotes" & ampersands');
    expect(result).toContain("Description with <html> & special chars");
  });

  it("ends with a trailing newline", () => {
    const result = buildLlmsTxt(baseOpts);
    expect(result).toMatch(/\n$/);
  });

  it("produces correct full output format", () => {
    const opts: LlmsTxtOptions = {
      name: "MyApp",
      description: "App description",
      overview: "Overview text here.",
      sections: [
        {
          heading: "Pages",
          items: [
            {
              title: "Page One",
              url: "https://myapp.com/one",
              description: "First page",
            },
            {
              title: "Page Two",
              url: "https://myapp.com/two",
              description: "Second page",
            },
          ],
        },
      ],
    };
    const expected = [
      "# MyApp",
      "",
      "> App description",
      "",
      "Overview text here.",
      "",
      "## Pages",
      "",
      "- [Page One](https://myapp.com/one): First page",
      "- [Page Two](https://myapp.com/two): Second page",
      "",
    ].join("\n");
    expect(buildLlmsTxt(opts)).toBe(expected);
  });

  it("produces correct output without overview", () => {
    const opts: LlmsTxtOptions = {
      name: "MyApp",
      description: "App description",
      sections: [
        {
          heading: "Pages",
          items: [
            {
              title: "Page One",
              url: "https://myapp.com/one",
              description: "First page",
            },
          ],
        },
      ],
    };
    const expected = [
      "# MyApp",
      "",
      "> App description",
      "",
      "## Pages",
      "",
      "- [Page One](https://myapp.com/one): First page",
      "",
    ].join("\n");
    expect(buildLlmsTxt(opts)).toBe(expected);
  });

  it("handles all sections being empty", () => {
    const opts: LlmsTxtOptions = {
      name: "Empty",
      description: "Nothing here",
      overview: "Some overview.",
      sections: [
        { heading: "A", items: [] },
        { heading: "B", items: [] },
      ],
    };
    const expected = [
      "# Empty",
      "",
      "> Nothing here",
      "",
      "Some overview.",
      "",
    ].join("\n");
    expect(buildLlmsTxt(opts)).toBe(expected);
  });

  it("handles empty sections array", () => {
    const opts: LlmsTxtOptions = {
      name: "Bare",
      description: "Bare minimum",
      sections: [],
    };
    const expected = ["# Bare", "", "> Bare minimum", ""].join("\n");
    expect(buildLlmsTxt(opts)).toBe(expected);
  });
});

describe("LlmsTxtOptions type", () => {
  it("accepts all required fields", () => {
    const opts: LlmsTxtOptions = {
      name: "Test",
      description: "Test desc",
      sections: [],
    };
    expect(opts.name).toBe("Test");
  });

  it("accepts optional overview", () => {
    const opts: LlmsTxtOptions = {
      name: "Test",
      description: "Test desc",
      overview: "Some overview",
      sections: [],
    };
    expect(opts.overview).toBe("Some overview");
  });
});

describe("LlmsTxtSection type", () => {
  it("has heading and items", () => {
    const section: LlmsTxtSection = {
      heading: "Test",
      items: [],
    };
    expect(section.heading).toBe("Test");
    expect(section.items).toEqual([]);
  });
});

describe("LlmsTxtItem type", () => {
  it("has title, url, and description", () => {
    const item: LlmsTxtItem = {
      title: "Title",
      url: "https://example.com",
      description: "Desc",
    };
    expect(item.title).toBe("Title");
    expect(item.url).toBe("https://example.com");
    expect(item.description).toBe("Desc");
  });
});

describe("buildLlmsTxtSections", () => {
  const siteUrl = "https://example.com/";
  const entries = [
    {
      id: "guide-a",
      data: { title: "Guide A", description: "First guide" },
    },
    {
      id: "guide-b",
      data: { title: "Guide B", description: "Second guide" },
    },
  ];

  it("maps manifest sections into llms sections using entry data by default", () => {
    const sections = buildLlmsTxtSections(siteUrl, [
      {
        heading: "Guides",
        entries,
        path: (entry) => `/resources/guides/${entry.id}`,
      },
    ]);

    expect(sections).toEqual([
      {
        heading: "Guides",
        items: [
          {
            title: "Guide A",
            url: "https://example.com/resources/guides/guide-a/",
            description: "First guide",
          },
          {
            title: "Guide B",
            url: "https://example.com/resources/guides/guide-b/",
            description: "Second guide",
          },
        ],
      },
    ]);
  });

  it("supports static path prefixes and custom field resolvers", () => {
    const sections = buildLlmsTxtSections("https://example.com", [
      {
        heading: "Alternatives",
        entries: [
          {
            slug: "service-titan",
            summary: "Compare alternatives",
            label: "ServiceTitan Alternative",
          },
        ],
        path: (entry) => `/compare/alternatives/${entry.slug}/`,
        title: (entry) => entry.label,
        description: (entry) => entry.summary,
      },
    ]);

    expect(sections[0]?.items).toEqual([
      {
        title: "ServiceTitan Alternative",
        url: "https://example.com/compare/alternatives/service-titan/",
        description: "Compare alternatives",
      },
    ]);
  });

  it("supports a static string path", () => {
    const sections = buildLlmsTxtSections("https://example.com", [
      {
        heading: "Static",
        entries: [
          {
            id: "guide-a",
            data: { title: "Guide A", description: "First guide" },
          },
        ],
        path: "/static-path",
      },
    ]);

    expect(sections[0]?.items[0]?.url).toBe("https://example.com/static-path/");
  });

  it("normalizes a path that lacks a leading slash", () => {
    const sections = buildLlmsTxtSections("https://example.com", [
      {
        heading: "No Slash",
        entries: [
          {
            id: "guide-a",
            data: { title: "Guide A", description: "First guide" },
          },
        ],
        path: "no-leading-slash",
      },
    ]);

    expect(sections[0]?.items[0]?.url).toBe(
      "https://example.com/no-leading-slash/",
    );
  });

  it("throws when entry has no data.title and no custom title resolver", () => {
    const entryWithoutData = { id: "bare-entry" };
    expect(() =>
      buildLlmsTxtSections("https://example.com", [
        {
          heading: "Section",
          entries: [entryWithoutData],
          path: () => "/path",
          // No title resolver -- should throw
        },
      ]),
    ).toThrow(
      "Llms manifest entries without data.title require an explicit title resolver.",
    );
  });

  it("throws when entry has no data.description and no custom description resolver", () => {
    // Provide a custom title resolver so title resolves fine,
    // but no description resolver -- should throw the description error.
    const entryWithoutDesc = { id: "no-desc", data: { title: "Has Title" } };
    expect(() =>
      buildLlmsTxtSections("https://example.com", [
        {
          heading: "Section",
          entries: [entryWithoutDesc as unknown as (typeof entries)[number]],
          path: () => "/path",
          title: (e) => (e as typeof entryWithoutDesc).data.title,
          // No description resolver and data lacks description -- should throw
        },
      ]),
    ).toThrow(
      "Llms manifest entries without data.description require an explicit description resolver.",
    );
  });

  it("filters entries and omits sections that resolve to zero items", () => {
    const manifest: LlmsTxtManifestSection<(typeof entries)[number]>[] = [
      {
        heading: "Filtered",
        entries,
        path: (entry) => `/guides/${entry.id}`,
        include: (entry) => entry.id === "guide-b",
      },
      {
        heading: "Empty",
        entries,
        path: () => "/unused",
        include: () => false,
      },
    ];

    const sections = buildLlmsTxtSections(siteUrl, manifest);

    expect(sections).toEqual([
      {
        heading: "Filtered",
        items: [
          {
            title: "Guide B",
            url: "https://example.com/guides/guide-b/",
            description: "Second guide",
          },
        ],
      },
    ]);
  });

  it("canonicalizes page URLs with trailing slashes while preserving file URLs", () => {
    const sections = buildLlmsTxtSections("https://example.com", [
      {
        heading: "Canonical",
        entries: [
          {
            id: "guide-a.md",
            data: { title: "Guide A", description: "First guide" },
          },
          {
            id: "pricing.txt",
            data: { title: "Pricing TXT", description: "Machine pricing" },
          },
        ],
        path: (entry) => `/resources/guides/${entry.id}`,
      },
    ]);

    expect(sections[0]?.items.map((item) => item.url)).toEqual([
      "https://example.com/resources/guides/guide-a/",
      "https://example.com/resources/guides/pricing.txt",
    ]);
  });
});

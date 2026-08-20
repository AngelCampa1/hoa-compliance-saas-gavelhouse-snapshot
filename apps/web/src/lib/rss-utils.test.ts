import { describe, it, expect } from "vitest";
import {
  buildRssFeedOptions,
  contentItemToRssItem,
  type RssContentItem,
} from "./rss-utils";

describe("buildRssFeedOptions", () => {
  const baseConfig = {
    name: "CrewRoute",
    domain: "crewroute.app",
    tagline: "Dispatch software for small contractors",
    metaDescription: "The simplest HVAC dispatch software for owner-operators.",
  };

  it("returns an object with title, description, site, and items", () => {
    const items: RssContentItem[] = [];
    const result = buildRssFeedOptions(baseConfig, items);
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("site");
    expect(result).toHaveProperty("items");
  });

  it("sets title to '{config.name} -- Updates'", () => {
    const result = buildRssFeedOptions(baseConfig, []);
    expect(result.title).toBe("CrewRoute -- Updates");
  });

  it("sets description to config.metaDescription when present", () => {
    const result = buildRssFeedOptions(baseConfig, []);
    expect(result.description).toBe(
      "The simplest HVAC dispatch software for owner-operators.",
    );
  });

  it("falls back to config.tagline when metaDescription is absent", () => {
    const config = {
      name: "CrewRoute",
      domain: "crewroute.app",
      tagline: "Dispatch software for small contractors",
    };
    const result = buildRssFeedOptions(config, []);
    expect(result.description).toBe("Dispatch software for small contractors");
  });

  it("sets site to 'https://{config.domain}'", () => {
    const result = buildRssFeedOptions(baseConfig, []);
    expect(result.site).toBe("https://crewroute.app");
  });

  it("passes items through unchanged", () => {
    const items = [
      {
        title: "Article 1",
        description: "Desc 1",
        pubDate: new Date("2026-01-01"),
        link: "https://crewroute.app/compare/alternatives/servicetitan",
      },
    ];
    const result = buildRssFeedOptions(baseConfig, items);
    expect(result.items).toBe(items);
  });

  it("passes an empty items array through", () => {
    const result = buildRssFeedOptions(baseConfig, []);
    expect(result.items).toEqual([]);
  });
});

describe("contentItemToRssItem", () => {
  it("returns an object with title, description, pubDate, and link", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      description: "Article description",
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/compare/alternatives/servicetitan",
    });
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("pubDate");
    expect(result).toHaveProperty("link");
  });

  it("maps title from input", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      description: "desc",
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/resources/guides/hvac-dispatch",
    });
    expect(result.title).toBe("My Article");
  });

  it("maps description from input", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      description: "Article description",
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/resources/guides/hvac-dispatch",
    });
    expect(result.description).toBe("Article description");
  });

  it("converts publishedAt string to a Date for pubDate", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      description: "desc",
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/resources/guides/hvac-dispatch",
    });
    expect(result.pubDate).toEqual(new Date("2026-01-15"));
    expect(result.pubDate).toBeInstanceOf(Date);
  });

  it("uses the link directly as the output link", () => {
    const link = "https://crewroute.app/compare/alternatives/servicetitan";
    const result = contentItemToRssItem({
      title: "My Article",
      description: "desc",
      publishedAt: "2026-01-15",
      link,
    });
    expect(result.link).toBe(link);
  });

  it("uses empty string when description is missing", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/resources/best/top-hvac-tools",
    });
    expect(result.description).toBe("");
  });

  it("uses empty string when description is explicitly undefined", () => {
    const result = contentItemToRssItem({
      title: "My Article",
      description: undefined,
      publishedAt: "2026-01-15",
      link: "https://crewroute.app/resources/best/top-hvac-tools",
    });
    expect(result.description).toBe("");
  });
});

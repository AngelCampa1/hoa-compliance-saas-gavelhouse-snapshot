import type { SiteConfig } from "./types";

export interface RssContentItem {
  title: string;
  description: string;
  pubDate: Date;
  link: string;
}

export interface RssFeedOptions {
  title: string;
  description: string;
  site: string;
  items: RssContentItem[];
}

export function buildRssFeedOptions(
  config: Pick<SiteConfig, "name" | "domain" | "tagline" | "metaDescription">,
  items: RssContentItem[],
): RssFeedOptions {
  return {
    title: `${config.name} -- Updates`,
    description: config.metaDescription ?? config.tagline,
    site: `https://${config.domain}`,
    items,
  };
}

export function contentItemToRssItem(item: {
  title: string;
  description?: string;
  publishedAt: string;
  link: string;
}): RssContentItem {
  return {
    title: item.title,
    description: item.description ?? "",
    pubDate: new Date(item.publishedAt),
    link: item.link,
  };
}

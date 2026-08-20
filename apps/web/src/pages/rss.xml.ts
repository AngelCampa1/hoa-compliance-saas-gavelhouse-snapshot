import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { siteConfig } from "../config/site";
import { canonicalPageUrl } from "../lib/canonical-url";
import {
  getComparisonPath,
  isSearchIndexableContentEntry,
} from "../lib/content-routing";
import { buildRssFeedOptions, contentItemToRssItem } from "../lib/rss-utils";
import type { APIContext } from "astro";

export async function GET(_context: APIContext) {
  const [
    alternatives,
    comparisons,
    pricingBreakdowns,
    listicles,
    guides,
    statePages,
    productPages,
    solutions,
  ] = await Promise.all([
    getCollection("alternatives"),
    getCollection("comparisons"),
    getCollection("pricing-breakdowns"),
    getCollection("listicles"),
    getCollection("guides"),
    getCollection("state-pages"),
    getCollection("product-pages"),
    getCollection("solutions"),
  ]);

  const siteUrl = `https://${siteConfig.domain}`;

  const items = [
    ...alternatives.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/compare/alternatives/${e.id}`),
      }),
    ),
    ...comparisons.filter(isSearchIndexableContentEntry).map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, getComparisonPath(e)),
      }),
    ),
    ...pricingBreakdowns.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/compare/pricing/${e.id}`),
      }),
    ),
    ...listicles.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/resources/best/${e.id}`),
      }),
    ),
    ...guides.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/resources/guides/${e.id}`),
      }),
    ),
    ...statePages.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/hoa-compliance/${e.id}`),
      }),
    ),
    ...productPages.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/product/${e.id}`),
      }),
    ),
    ...solutions.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: canonicalPageUrl(siteUrl, `/solutions/${e.id}`),
      }),
    ),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss(buildRssFeedOptions(siteConfig, items));
}

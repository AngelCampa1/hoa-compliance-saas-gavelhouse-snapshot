import { getCollection } from "astro:content";
import { siteConfig } from "../config/site";
import { canonicalPageUrl } from "../lib/canonical-url";
import { buildLlmsTxt } from "../lib/llms-txt";
import {
  getComparisonPath,
  isSearchIndexableContentEntry,
} from "../lib/content-routing";
import type { APIContext } from "astro";

export const prerender = true;

export async function GET(_context: APIContext) {
  const siteUrl = `https://${siteConfig.domain}`;

  const [
    alternatives,
    comparisons,
    pricingBreakdowns,
    listicles,
    guides,
    statePages,
    leadMagnets,
    productPages,
    solutions,
  ] = await Promise.all([
    getCollection("alternatives"),
    getCollection("comparisons"),
    getCollection("pricing-breakdowns"),
    getCollection("listicles"),
    getCollection("guides"),
    getCollection("state-pages"),
    getCollection("lead-magnets"),
    getCollection("product-pages"),
    getCollection("solutions"),
  ]);

  const body = buildLlmsTxt({
    name: siteConfig.name,
    description: siteConfig.metaDescription ?? siteConfig.tagline,
    overview: siteConfig.tagline,
    sections: [
      {
        heading: "Guides",
        items: guides.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/resources/guides/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Product Pages",
        items: productPages.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/product/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Solutions",
        items: solutions.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/solutions/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Comparisons",
        items: comparisons.filter(isSearchIndexableContentEntry).map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, getComparisonPath(e)),
          description: e.data.description,
        })),
      },
      {
        heading: "Alternatives",
        items: alternatives.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/compare/alternatives/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Pricing Breakdowns",
        items: pricingBreakdowns.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/compare/pricing/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Listicles",
        items: listicles.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/resources/best/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "State Pages",
        items: statePages.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/hoa-compliance/${e.id}`),
          description: e.data.description,
        })),
      },
      {
        heading: "Free Resources",
        items: leadMagnets.map((e) => ({
          title: e.data.title,
          url: canonicalPageUrl(siteUrl, `/free/${e.id}`),
          description: e.data.description,
        })),
      },
    ],
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

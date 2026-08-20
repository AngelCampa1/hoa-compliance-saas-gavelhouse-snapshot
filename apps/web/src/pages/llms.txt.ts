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
    productPages,
    solutions,
  ] = await Promise.all([
    getCollection("alternatives"),
    getCollection("comparisons"),
    getCollection("pricing-breakdowns"),
    getCollection("listicles"),
    getCollection("guides"),
    getCollection("product-pages"),
    getCollection("solutions"),
  ]);

  const body = buildLlmsTxt({
    name: siteConfig.name,
    description: siteConfig.metaDescription ?? siteConfig.tagline,
    overview: siteConfig.tagline,
    keyLinks: {
      heading: "Machine-readable files",
      items: [
        {
          title: "Full site index",
          url: `${siteUrl}/llms-full.txt`,
          description: "A larger index of public Gavelhouse pages.",
        },
        {
          title: "Pricing data",
          url: `${siteUrl}/pricing.txt`,
          description: "Plan prices, billing terms, promo codes, and features.",
        },
        {
          title: "Pricing page",
          url: `${siteUrl}/pricing/`,
          description: "Human-readable plan details and signup links.",
        },
        {
          title: "Free resources",
          url: `${siteUrl}/free/`,
          description: "Templates, checklists, and calculators for HOA boards.",
        },
        {
          title: "HOA compliance",
          url: `${siteUrl}/hoa-compliance/`,
          description: "State rule guides for HOA and condo boards.",
        },
      ],
    },
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
    ],
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

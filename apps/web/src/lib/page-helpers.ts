import { buildHowToSchema } from "./schema-builders";
import type { CollectionEntry } from "astro:content";
import { getComparisonPath, isRoutableContentEntry } from "./content-routing";

type ContentEntry = { title: string; description: string };

export function buildContentMap(collections: {
  alternatives: CollectionEntry<"alternatives">[];
  comparisons: CollectionEntry<"comparisons">[];
  pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
  listicles: CollectionEntry<"listicles">[];
  guides: CollectionEntry<"guides">[];
  statePages: CollectionEntry<"state-pages">[];
  leadMagnets: CollectionEntry<"lead-magnets">[];
  productPages: CollectionEntry<"product-pages">[];
  solutions: CollectionEntry<"solutions">[];
}): Map<string, ContentEntry> {
  const map = new Map<string, ContentEntry>();

  for (const entry of collections.alternatives) {
    map.set(`/compare/alternatives/${entry.data.competitor.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.comparisons.filter(isRoutableContentEntry)) {
    const key = getComparisonPath(entry).replace(/\/$/, "");
    map.set(key, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.pricingBreakdowns) {
    map.set(`/compare/pricing/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.listicles) {
    map.set(`/resources/best/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.guides) {
    map.set(`/resources/guides/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.statePages) {
    map.set(`/hoa-compliance/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.leadMagnets) {
    map.set(`/free/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.productPages) {
    map.set(`/product/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.solutions) {
    map.set(`/solutions/${entry.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  return map;
}

export function padToolIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function buildOptionalHowToSchema(
  steps: { title: string; content: string }[] | undefined,
  name: string,
  description: string,
): Record<string, unknown> | null {
  if (!steps || steps.length === 0) return null;
  return buildHowToSchema({ name, description, steps });
}

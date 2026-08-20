import type { CollectionEntry } from "astro:content";
import type { LeadMagnet, ResolvedLeadMagnetOffer } from "./types";

type LeadMagnetEntry = CollectionEntry<"lead-magnets">;

function normalizePath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function getLeadMagnetPath(slug: string): string {
  return `/free/${slug}`;
}

function createOfferFromLeadMagnet(
  leadMagnet: LeadMagnet,
): ResolvedLeadMagnetOffer {
  if (!leadMagnet.slug) {
    throw new Error(
      "Site leadMagnet config must include a slug to resolve the canonical destination.",
    );
  }

  return {
    slug: leadMagnet.slug,
    title: leadMagnet.title,
    description: leadMagnet.description,
    ctaText: leadMagnet.ctaText ?? "Get the Free Guide",
    destination: `${getLeadMagnetPath(leadMagnet.slug)}/`,
    teaser: leadMagnet.teaser,
  };
}

function createOfferFromEntry(
  entry: LeadMagnetEntry,
  fallback?: LeadMagnet,
): ResolvedLeadMagnetOffer {
  return {
    slug: entry.slug,
    title: entry.data.title,
    description: entry.data.description,
    ctaText: fallback?.ctaText ?? "Get the Free Guide",
    destination: `${getLeadMagnetPath(entry.slug)}/`,
    teaser: fallback?.teaser,
  };
}

export function resolveLeadMagnetOffer(params: {
  relatedPages?: string[];
  leadMagnets: LeadMagnetEntry[];
  fallbackLeadMagnet?: LeadMagnet;
}): ResolvedLeadMagnetOffer {
  const { relatedPages = [], leadMagnets, fallbackLeadMagnet } = params;
  const byPath = new Map(
    leadMagnets.map((entry) => [getLeadMagnetPath(entry.slug), entry]),
  );

  for (const relatedPage of relatedPages) {
    const normalized = normalizePath(relatedPage);
    if (!normalized.startsWith("/free/")) {
      continue;
    }

    const match = byPath.get(normalized);
    if (match) {
      return createOfferFromEntry(match, fallbackLeadMagnet);
    }
  }

  if (!fallbackLeadMagnet) {
    throw new Error(
      "Unable to resolve a lead magnet offer without related /free pages or a fallback site lead magnet.",
    );
  }

  const fallbackEntry = byPath.get(
    getLeadMagnetPath(fallbackLeadMagnet.slug ?? ""),
  );
  if (fallbackEntry) {
    return createOfferFromEntry(fallbackEntry, fallbackLeadMagnet);
  }

  return createOfferFromLeadMagnet(fallbackLeadMagnet);
}

export function toLeadMagnet(offer: ResolvedLeadMagnetOffer): LeadMagnet {
  return {
    title: offer.title,
    description: offer.description,
    slug: offer.slug,
    teaser: offer.teaser,
    ctaText: offer.ctaText,
  };
}

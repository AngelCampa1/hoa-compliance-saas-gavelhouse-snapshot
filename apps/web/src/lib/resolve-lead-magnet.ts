import { getCollection } from "astro:content";
import {
  LEAD_MAGNET,
  pickMagnetSlugForPage,
  type LeadMagnetSlug,
  type MagnetPageMeta,
} from "@boardstack/shared";
import type { LeadMagnet } from "./types";

/**
 * Resolve a magnet slug to a LeadMagnet using copy from the `lead-magnets`
 * content collection (single source of truth). Falls back to the global
 * default magnet when the slug has no entry.
 */
export async function resolveLeadMagnetBySlug(
  slug?: string | null,
): Promise<LeadMagnet> {
  if (!slug) return LEAD_MAGNET;
  const entries = await getCollection("lead-magnets");
  const match = entries.find((e) => e.slug === slug);
  if (!match) return LEAD_MAGNET;
  return {
    slug: match.slug as LeadMagnetSlug,
    title: match.data.title,
    description: match.data.description,
  };
}

/** Pick the slug for a page (explicit → keyword map → default), then resolve copy. */
export async function resolveMagnetForPage(
  meta: MagnetPageMeta,
): Promise<LeadMagnet> {
  return resolveLeadMagnetBySlug(pickMagnetSlugForPage(meta));
}

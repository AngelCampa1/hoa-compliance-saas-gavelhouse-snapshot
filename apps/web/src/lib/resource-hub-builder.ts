import type { CollectionEntry } from "astro:content";
import { PRODUCT_HELP_TOPICS } from "@boardstack/shared";
import type { ContentItem } from "./types";
import {
  RESOURCE_HUBS,
  findResourceHub,
  getResourceHubsForPath,
  type ResourceHubDefinition,
} from "./resource-hub-data";
import { sortByUpdatedAtDesc } from "./collections";

const FAMILY_LABELS = {
  static: "Core Pages",
  guides: "Guides",
  listicles: "Software Roundups",
  "lead-magnets": "Free Tools & Templates",
  "state-pages": "State Compliance",
  alternatives: "Alternatives",
  comparisons: "Head-to-Head Comparisons",
  "pricing-breakdowns": "Pricing Breakdowns",
  "product-pages": "Product Workflows",
  solutions: "Solutions",
  help: "Product Help",
};

type HubResourceFamily = keyof typeof FAMILY_LABELS;

export interface HubResource extends ContentItem {
  family: HubResourceFamily;
}

type RawHubResource = Omit<HubResource, "relatedPages"> & {
  relatedPages?: HubResource["relatedPages"];
};

export interface BuiltResourceHub {
  hub: ResourceHubDefinition;
  resources: HubResource[];
  groupedResources: { heading: string; resources: HubResource[] }[];
}

export interface ResourceHubCollections {
  alternatives: CollectionEntry<"alternatives">[];
  comparisons: CollectionEntry<"comparisons">[];
  pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
  listicles: CollectionEntry<"listicles">[];
  guides: CollectionEntry<"guides">[];
  statePages: CollectionEntry<"state-pages">[];
  leadMagnets: CollectionEntry<"lead-magnets">[];
  productPages: CollectionEntry<"product-pages">[];
  solutions: CollectionEntry<"solutions">[];
}

const STATIC_RESOURCES: RawHubResource[] = [
  {
    title: "Gavelhouse Home",
    description:
      "The main Gavelhouse overview for volunteer HOA and condo boards.",
    href:"/",
    buyerStage: "bofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Resources",
    description: "The top-level library for Gavelhouse public resources.",
    href:"/resources/",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Gavelhouse Features",
    description:
      "Feature overview for Gavelhouse finance, governance, owner, and compliance workflows.",
    href:"/features/",
    buyerStage: "mofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Compare Gavelhouse",
    description:
      "Compare Gavelhouse with HOA software alternatives, pricing models, and head-to-head options.",
    href:"/compare/",
    buyerStage: "mofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Free HOA Resources",
    description:
      "Free templates, checklists, calculators, and planning resources for HOA boards.",
    href:"/free/",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "HOA Compliance by State",
    description:
      "State-specific HOA reserve and governance compliance guidance.",
    href:"/hoa-compliance/",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Gavelhouse Product",
    description:
      "Product workflows for board finance, governance, owner operations, and compliance.",
    href:"/product/",
    buyerStage: "bofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Gavelhouse Solutions",
    description:
      "Role, segment, and migration pages for boards evaluating Gavelhouse.",
    href:"/solutions/",
    buyerStage: "mofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Gavelhouse Help Center",
    description:
      "Plain-language help for common Gavelhouse setup and product tasks.",
    href:"/help/",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "help",
  },
  {
    title: "Pricing",
    description:
      "Flat monthly Gavelhouse pricing without per-unit software fees.",
    href:"/pricing/",
    buyerStage: "bofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "About Gavelhouse",
    description: "Company background and Gavelhouse positioning.",
    href:"/about/",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "Contact Gavelhouse",
    description: "Contact options for Gavelhouse questions and support.",
    href:"/contact/",
    buyerStage: "bofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "llms.txt",
    description:
      "Machine-readable Gavelhouse context for AI systems and agents.",
    href:"/llms.txt",
    buyerStage: "tofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
  {
    title: "pricing.txt",
    description:
      "Machine-readable Gavelhouse pricing context for AI systems and agents.",
    href:"/pricing.txt",
    buyerStage: "bofu",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    family: "static",
  },
];

function toResource(
  entry: CollectionEntry<"guides">,
  href: string,
  family: HubResourceFamily,
): HubResource {
  return {
    title: entry.data.title,
    description: entry.data.description,
    href,
    buyerStage: entry.data.buyerStage,
    publishedAt: entry.data.publishedAt,
    updatedAt: entry.data.updatedAt,
    relatedPages: [],
    family,
  };
}

function dedupeResources(resources: HubResource[]): HubResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (seen.has(resource.href)) return false;
    seen.add(resource.href);
    return true;
  });
}

function groupResources(resources: HubResource[]) {
  const groups = new Map<string, HubResource[]>();
  for (const resource of resources) {
    const heading = FAMILY_LABELS[resource.family];
    groups.set(heading, [...(groups.get(heading) ?? []), resource]);
  }
  return [...groups.entries()].map(([heading, grouped]) => ({
    heading,
    resources: grouped,
  }));
}

export function buildAllHubResources(
  collections: ResourceHubCollections,
): HubResource[] {
  const {
    alternatives,
    comparisons,
    pricingBreakdowns,
    listicles,
    guides,
    statePages,
    leadMagnets,
    productPages,
    solutions,
  } = collections;

  const resources: RawHubResource[] = [
    ...STATIC_RESOURCES,
    ...PRODUCT_HELP_TOPICS.map((topic) => ({
      title: topic.title,
      description: topic.summary,
      href: `/help/${topic.slug}/`,
      buyerStage: "tofu" as const,
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-01",
      family: "help" as const,
    })),
    ...sortByUpdatedAtDesc(alternatives).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/compare/alternatives/${entry.data.competitor.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "alternatives" as const,
    })),
    ...sortByUpdatedAtDesc(comparisons).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/compare/versus/${entry.data.competitorA.slug}-vs-${entry.data.competitorB.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "comparisons" as const,
    })),
    ...sortByUpdatedAtDesc(pricingBreakdowns).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/compare/pricing/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "pricing-breakdowns" as const,
    })),
    ...sortByUpdatedAtDesc(listicles).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/resources/best/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "listicles" as const,
    })),
    ...sortByUpdatedAtDesc(guides).map((entry) =>
      toResource(entry, `/resources/guides/${entry.slug}/`, "guides"),
    ),
    ...sortByUpdatedAtDesc(statePages).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/hoa-compliance/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "state-pages" as const,
    })),
    ...sortByUpdatedAtDesc(leadMagnets).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/free/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "lead-magnets" as const,
    })),
    ...sortByUpdatedAtDesc(productPages).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/product/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "product-pages" as const,
    })),
    ...sortByUpdatedAtDesc(solutions).map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      href: `/solutions/${entry.slug}/`,
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      family: "solutions" as const,
    })),
  ];

  return dedupeResources(
    resources.map((resource) => ({
      ...resource,
      relatedPages: resource.relatedPages ?? [],
    })),
  );
}

export function buildResourceHub(
  slug: string,
  collections: ResourceHubCollections,
): BuiltResourceHub | null {
  const hub = findResourceHub(slug);
  if (!hub) return null;

  const resources = buildAllHubResources(collections).filter((resource) =>
    getResourceHubsForPath(resource.href).some(
      (candidate) => candidate.slug === hub.slug,
    ),
  );

  return {
    hub,
    resources,
    groupedResources: groupResources(resources),
  };
}

export function getResourceHubStaticPaths() {
  return RESOURCE_HUBS.map((hub) => ({
    params: { slug: hub.slug },
    props: { slug: hub.slug },
  }));
}

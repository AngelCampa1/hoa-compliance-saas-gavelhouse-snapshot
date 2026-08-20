export interface ResourceHubDefinition {
  slug: string;
  title: string;
  description: string;
  menuSection: string;
  menuLabel: string;
  menuDescription: string;
  include: {
    exact?: string[];
    prefixes?: string[];
    contains?: string[];
  };
}

export const RESOURCE_HUB_BASE_PATH = "/resources/hubs";

export const RESOURCE_HUBS: ResourceHubDefinition[] = [
  {
    slug: "all-board-resources",
    title: "All Gavelhouse Resources",
    description:
      "A complete index of Gavelhouse resources, guides, comparisons, free tools, product pages, and help articles for self-managed HOA boards.",
    menuSection: "Guides",
    menuLabel: "All Board Resources",
    menuDescription: "Every public resource organized from one hub",
    include: {
      exact: [
        "/",
        "/about/",
        "/contact/",
        "/dpa/",
        "/features/",
        "/compare/",
        "/free/",
        "/help/",
        "/hoa-compliance/",
        "/llms.txt",
        "/pricing/",
        "/pricing.txt",
        "/privacy/",
        "/product/",
        "/resources/",
        "/resources/best/",
        "/resources/guides/",
        "/solutions/",
        "/subprocessors/",
        "/terms/",
      ],
      prefixes: [
        "/compare/",
        "/features/",
        "/free/",
        "/help/",
        "/hoa-compliance/",
        "/product/",
        "/resources/best/",
        "/resources/guides/",
        "/solutions/",
      ],
    },
  },
  {
    slug: "hoa-accounting",
    title: "HOA Accounting Resources",
    description:
      "Guides, software comparisons, pricing breakdowns, and product workflows for HOA accounting, fund separation, dues, collections, and financial reporting.",
    menuSection: "Guides",
    menuLabel: "HOA Accounting",
    menuDescription: "Fund accounting, dues, collections, and reporting",
    include: {
      prefixes: ["/compare/pricing/"],
      contains: [
        "accounting",
        "assess",
        "budget",
        "collection",
        "dues",
        "fee",
        "financial",
        "fund",
        "payment",
        "pricing",
        "quickbooks",
        "treasurer",
      ],
    },
  },
  {
    slug: "reserve-studies",
    title: "Reserve Study and Reserve Fund Resources",
    description:
      "Reserve study explainers, reserve fund calculators, state reserve laws, and software workflows that help volunteer boards stay audit-ready.",
    menuSection: "Guides",
    menuLabel: "Reserve Studies",
    menuDescription: "Reserve study, reserve fund, and compliance resources",
    include: {
      prefixes: ["/hoa-compliance/"],
      contains: ["fannie-mae", "funded", "reserve", "surfside"],
    },
  },
  {
    slug: "software-buying",
    title: "HOA Software Buying Hub",
    description:
      "Roundups, comparisons, pricing research, alternatives, and buying guides for boards choosing HOA management software.",
    menuSection: "Software Roundups",
    menuLabel: "Software Buying",
    menuDescription: "Roundups, comparisons, and buying guidance",
    include: {
      prefixes: ["/compare/", "/product/", "/resources/best/", "/solutions/"],
      contains: ["choose-hoa-software", "hoa-software", "software"],
    },
  },
  {
    slug: "self-managed-boards",
    title: "Self-Managed HOA Board Resources",
    description:
      "Resources for volunteer-run and self-managed HOA boards, from board roles and governance to practical operating workflows.",
    menuSection: "Software Roundups",
    menuLabel: "Self-Managed Boards",
    menuDescription: "Software and guidance for volunteer-run communities",
    include: {
      prefixes: ["/solutions/"],
      contains: [
        "board",
        "president",
        "secretary",
        "self-managed",
        "volunteer",
      ],
    },
  },
  {
    slug: "free-templates-checklists",
    title: "Free HOA Templates and Checklists",
    description:
      "Free templates, checklists, planners, scorecards, and downloadable resources for volunteer HOA board work.",
    menuSection: "Free Tools & Templates",
    menuLabel: "Templates & Checklists",
    menuDescription: "Downloadable templates, checklists, and planners",
    include: {
      prefixes: ["/free/"],
      contains: ["checklist", "planner", "scorecard", "template"],
    },
  },
  {
    slug: "calculators",
    title: "HOA Calculators and Planning Tools",
    description:
      "Calculators and planning resources for reserves, budgets, pricing, software evaluation, and board finance decisions.",
    menuSection: "Free Tools & Templates",
    menuLabel: "Calculators",
    menuDescription: "Reserve, budget, pricing, and evaluation tools",
    include: {
      prefixes: ["/free/"],
      contains: ["calculator", "cost", "pricing", "scorecard"],
    },
  },
  {
    slug: "state-compliance",
    title: "State HOA Compliance Hub",
    description:
      "State-by-state HOA and condo compliance resources covering reserve studies, commingling rules, disclosures, and governance obligations.",
    menuSection: "Compliance",
    menuLabel: "State Compliance",
    menuDescription: "Reserve and governance rules by state",
    include: {
      exact: ["/hoa-compliance/"],
      prefixes: ["/hoa-compliance/"],
      contains: ["compliance", "law", "reserve-requirements"],
    },
  },
  {
    slug: "california-compliance",
    title: "California HOA Compliance Resources",
    description:
      "California HOA and condo resources for Davis-Stirling reserve requirements, board governance, software decisions, and compliance workflows.",
    menuSection: "Compliance",
    menuLabel: "California Compliance",
    menuDescription: "Davis-Stirling and California HOA resources",
    include: {
      contains: ["california", "davis-stirling"],
    },
  },
  {
    slug: "florida-compliance",
    title: "Florida HOA Compliance Resources",
    description:
      "Florida HOA and condo resources for milestone inspections, reserve requirements, board liability, and compliance workflows.",
    menuSection: "Compliance",
    menuLabel: "Florida Compliance",
    menuDescription: "Milestone inspection and Florida reserve resources",
    include: {
      contains: ["florida", "milestone", "surfside"],
    },
  },
  {
    slug: "software-comparisons",
    title: "HOA Software Comparison Hub",
    description:
      "Alternatives, head-to-head comparisons, pricing pages, and decision resources for comparing HOA software platforms.",
    menuSection: "Compare",
    menuLabel: "Software Comparisons",
    menuDescription: "Alternatives, head-to-head, and pricing research",
    include: {
      exact: ["/compare/"],
      prefixes: ["/compare/"],
      contains: ["alternative", "comparison", "versus", "vs"],
    },
  },
  {
    slug: "gavelhouse-product-help",
    title: "Gavelhouse Product Help Hub",
    description:
      "Product overview, help center articles, pricing, and workflow pages for boards learning how Gavelhouse supports their work.",
    menuSection: "Product Help",
    menuLabel: "Product Help",
    menuDescription: "Help, product workflows, and setup paths",
    include: {
      exact: ["/help/", "/pricing/", "/product/"],
      prefixes: ["/features/", "/help/", "/product/"],
      contains: ["gavelhouse", "portal", "workflow"],
    },
  },
];

export function getResourceHubHref(slug: string): string {
  return `${RESOURCE_HUB_BASE_PATH}/${slug}/`;
}

export function normalizeHubPath(pathname: string): string {
  if (pathname === "/") return pathname;
  if (pathname.endsWith(".txt")) return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function findResourceHub(slug: string): ResourceHubDefinition | null {
  return RESOURCE_HUBS.find((hub) => hub.slug === slug) ?? null;
}

export function getResourceHubsForPath(
  pathname: string,
): ResourceHubDefinition[] {
  const normalized = normalizeHubPath(pathname);
  if (normalized.startsWith(`${RESOURCE_HUB_BASE_PATH}/`)) {
    return [];
  }
  const searchable = normalized.toLowerCase();

  return RESOURCE_HUBS.filter((hub) => {
    if (hub.include.exact?.includes(normalized)) return true;
    if (
      hub.include.prefixes?.some(
        (prefix) =>
          searchable === normalizeHubPath(prefix).toLowerCase() ||
          searchable.startsWith(normalizeHubPath(prefix).toLowerCase()),
      )
    ) {
      return true;
    }
    return (
      hub.include.contains?.some((term) =>
        searchable.includes(term.toLowerCase()),
      ) ?? false
    );
  });
}

export function getPrimaryResourceHubForPath(
  pathname: string,
): ResourceHubDefinition | null {
  return getResourceHubsForPath(pathname)[0] ?? null;
}

import { LEAD_MAGNET_SLUGS, type LeadMagnetSlug } from "./schemas/leadMagnet";

/** Global backstop — the core positioning magnet. Always topically safe. */
export const DEFAULT_MAGNET_SLUG: LeadMagnetSlug =
  "50-state-reserve-fund-requirements";

const SLUG_SET = new Set<string>(LEAD_MAGNET_SLUGS);

function isLeadMagnetSlug(value: string): value is LeadMagnetSlug {
  return SLUG_SET.has(value);
}

/**
 * Ordered keyword → magnet rules. First rule whose ANY keyword appears in the
 * page's combined text wins. Order matters: more specific rules first.
 */
const RULES: ReadonlyArray<{
  slug: LeadMagnetSlug;
  keywords: readonly string[];
}> = [
  {
    slug: "hoa-board-meeting-agenda-template",
    keywords: ["meeting agenda", "board agenda", "meeting minute"],
  },
  {
    slug: "hoa-annual-meeting-planner",
    keywords: ["annual meeting", "annual meeting planner"],
  },
  {
    slug: "hoa-collections-policy-template",
    keywords: ["collection", "delinquen", "past due", "assessment recovery"],
  },
  {
    slug: "hoa-fiduciary-duty-checklist",
    keywords: ["fiduciary", "personal liability", "duty of care"],
  },
  {
    slug: "hoa-cybersecurity-checklist",
    keywords: ["cyber", "security breach", "data breach", "phishing"],
  },
  {
    slug: "hoa-ccr-enforcement-checklist",
    keywords: ["cc&r", "ccr", "covenant", "enforcement", "violation"],
  },
  {
    slug: "hoa-board-transition-checklist",
    keywords: ["transition", "board turnover", "handover"],
  },
  {
    slug: "hoa-board-onboarding-kit",
    keywords: ["onboarding", "new board member", "orientation"],
  },
  {
    slug: "hoa-newsletter-template",
    keywords: ["newsletter", "communication template"],
  },
  {
    slug: "hoa-software-evaluation-scorecard",
    keywords: ["software", " vs ", "alternative", "comparison", "evaluat"],
  },
  // Ordering intentional: RFP rule must precede the general reserve rule so "reserve study rfp" pages resolve to the RFP template, not the calculator.
  {
    slug: "reserve-study-rfp-template",
    keywords: ["reserve study rfp", "rfp", "request for proposal"],
  },
  {
    slug: "reserve-fund-calculator",
    keywords: [
      "reserve fund",
      "reserve study",
      "reserve",
      "funding plan",
      "percent funded",
    ],
  },
  // Ordering intentional: the broad "budget" rule sits below reserve rules so "reserve fund budget" pages resolve to the reserve calculator, not the budget template.
  { slug: "hoa-budget-template", keywords: ["budget"] },
];

export interface MagnetPageMeta {
  explicitSlug?: string | null;
  primaryKeyword?: string | null;
  tags?: readonly string[] | null;
  category?: string | null;
  path?: string | null;
}

/**
 * Pure resolver: explicit valid slug → keyword/category rule → global default.
 * No I/O. Safe to use in shared, web, and tests.
 */
export function pickMagnetSlugForPage(meta: MagnetPageMeta): LeadMagnetSlug {
  if (meta.explicitSlug && isLeadMagnetSlug(meta.explicitSlug)) {
    return meta.explicitSlug;
  }
  const haystack = [
    meta.primaryKeyword ?? "",
    (meta.tags ?? []).join(" "),
    meta.category ?? "",
    meta.path ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.slug;
    }
  }
  return DEFAULT_MAGNET_SLUG;
}

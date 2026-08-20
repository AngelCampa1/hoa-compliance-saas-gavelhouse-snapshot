export type GeneratedProductVisualVariant =
  | "board-record"
  | "reserve-compliance"
  | "fund-accounting"
  | "governance"
  | "owner-portal"
  | "pricing-comparison";

export type GeneratedProductVisualTone = "paper" | "ink" | "accent";

export interface GeneratedProductVisualRow {
  label: string;
  value: string;
  status?: string;
}

export interface GeneratedProductVisualPreset {
  variant: GeneratedProductVisualVariant;
  title: string;
  caption: string;
  primaryMetric: string;
  rows: GeneratedProductVisualRow[];
  actions: string[];
  tone: GeneratedProductVisualTone;
}

interface ProductVisualContext {
  slug: string;
  productCategory: string;
}

interface SolutionVisualContext {
  relatedProductSlugs: string[];
  solutionCategory: string;
}

interface CompareVisualContext {
  type: "hub" | "alternative" | "versus" | "pricing";
  competitorName?: string;
  competitorPricing?: string;
}

const presets: Record<
  GeneratedProductVisualVariant,
  GeneratedProductVisualPreset
> = {
  "board-record": {
    variant: "board-record",
    title: "Board records",
    caption: "Money, votes, owner work, and rule notes stay in one place.",
    primaryMetric: "4 jobs in sync",
    rows: [
      { label: "Reserve packet", value: "Ready for review", status: "Current" },
      { label: "Board vote", value: "Roof bid approved", status: "Logged" },
      { label: "Owner request", value: "3 open items", status: "Assigned" },
    ],
    actions: ["Review packet", "Post update", "Export record"],
    tone: "paper",
  },
  "reserve-compliance": {
    variant: "reserve-compliance",
    title: "Reserve status",
    caption: "Track reserve cash, study goals, notices, and due dates.",
    primaryMetric: "82% funded",
    rows: [
      { label: "Reserve balance", value: "$284,600", status: "Synced" },
      { label: "Study target", value: "$347,000", status: "Gap visible" },
      { label: "Disclosure due", value: "21 days", status: "Queued" },
    ],
    actions: ["Update study", "Prepare disclosure", "Flag gap"],
    tone: "accent",
  },
  "fund-accounting": {
    variant: "fund-accounting",
    title: "Operating and reserve separation",
    caption:
      "Separate fund ledgers keep operating spend, reserve contributions, and capital projects from commingling.",
    primaryMetric: "2 protected funds",
    rows: [
      { label: "Operating cash", value: "$48,920", status: "Available" },
      { label: "Reserve cash", value: "$284,600", status: "Restricted" },
      {
        label: "Transfer control",
        value: "Board approval",
        status: "Required",
      },
    ],
    actions: ["Reconcile funds", "Review transfer", "Export ledger"],
    tone: "paper",
  },
  governance: {
    variant: "governance",
    title: "Governance workflow queue",
    caption:
      "Meetings, votes, architectural requests, and enforcement follow-through stay visible to the board.",
    primaryMetric: "7 decisions tracked",
    rows: [
      {
        label: "Meeting packet",
        value: "April board meeting",
        status: "Ready",
      },
      {
        label: "Architectural request",
        value: "Fence variance",
        status: "Voting",
      },
      { label: "Violation follow-up", value: "2 notices", status: "Scheduled" },
    ],
    actions: ["Open agenda", "Record vote", "Send notice"],
    tone: "ink",
  },
  "owner-portal": {
    variant: "owner-portal",
    title: "Owner operations view",
    caption:
      "Owner ledger, service requests, documents, and status updates stay organized without rebuilding history from email.",
    primaryMetric: "96% owner visibility",
    rows: [
      { label: "Ledger status", value: "18 autopay", status: "Healthy" },
      { label: "Open requests", value: "5 items", status: "Routed" },
      { label: "Documents", value: "42 published", status: "Current" },
    ],
    actions: ["Post document", "Route request", "Send update"],
    tone: "paper",
  },
  "pricing-comparison": {
    variant: "pricing-comparison",
    title: "Flat pricing comparison",
    caption:
      "Compare Gavelhouse flat pricing against per-door platforms, setup fees, and software stacks built for property managers.",
    primaryMetric: "From $15/mo",
    rows: [
      { label: "Gavelhouse", value: "Flat by size", status: "No setup fee" },
      { label: "Per-door tools", value: "$3-$8/door", status: "Scales up" },
      { label: "Stack overlap", value: "3-5 tools", status: "Hidden cost" },
    ],
    actions: ["Compare 100 units", "Check setup fees", "Model savings"],
    tone: "accent",
  },
};

function includesAny(value: string, matches: string[]) {
  const normalized = value.toLowerCase();
  return matches.some((match) => normalized.includes(match));
}

function variantFromProductText(text: string): GeneratedProductVisualVariant {
  if (includesAny(text, ["reserve", "compliance"])) {
    return "reserve-compliance";
  }

  if (
    includesAny(text, ["fund accounting", "financial", "dues", "collections"])
  ) {
    return "fund-accounting";
  }

  if (
    includesAny(text, [
      "governance",
      "meeting",
      "voting",
      "architectural",
      "violation",
    ])
  ) {
    return "governance";
  }

  if (includesAny(text, ["owner", "portal", "website", "work order"])) {
    return "owner-portal";
  }

  return "board-record";
}

export function resolveProductVisualPreset({
  slug,
  productCategory,
}: ProductVisualContext): GeneratedProductVisualPreset {
  return presets[variantFromProductText(`${slug} ${productCategory}`)];
}

export function resolveSolutionVisualPreset({
  relatedProductSlugs,
  solutionCategory,
}: SolutionVisualContext): GeneratedProductVisualPreset {
  const joined = `${solutionCategory} ${relatedProductSlugs.join("")}`;
  return presets[variantFromProductText(joined)];
}

export function resolveCompareProductVisualPreset({
  type,
  competitorName,
}: CompareVisualContext): GeneratedProductVisualPreset {
  if (type === "pricing" || type === "alternative") {
    return {
      ...presets["pricing-comparison"],
      caption: competitorName
        ? `Compare Gavelhouse flat pricing against ${competitorName} pricing, setup fees, and stack overlap.`
        : presets["pricing-comparison"].caption,
    };
  }

  return presets[type === "hub" ? "pricing-comparison" : "board-record"];
}

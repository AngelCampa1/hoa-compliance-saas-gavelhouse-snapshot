import { knowledgeBase } from "./knowledge/index.js";

export const PRODUCT_HELP_VERSION = knowledgeBase.app.help.version;

export type HelpAudience = "board" | "homeowner" | "everyone";
export type HelpCategory =
  | "start"
  | "files"
  | "finance"
  | "governance"
  | "reports"
  | "owner-portal";

export interface ProductHelpSection {
  heading: string;
  body: string;
  steps?: string[];
}

export interface ProductHelpTopic {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategory;
  audience: HelpAudience;
  timeEstimate: string;
  relatedRoutes: string[];
  sections: ProductHelpSection[];
  glossaryTerms: string[];
}

export interface ProductRolePath {
  slug: string;
  role: string;
  summary: string;
  firstSteps: string[];
  href: string;
}

export interface ProductPageHelp {
  routes: string[];
  title: string;
  purpose: string;
  nextStep: string;
  commonMistake: string;
  href: string;
}

export interface ProductFieldHelp {
  key: string;
  label: string;
  body: string;
  example?: string;
}

export interface ContextualHelp {
  title: string;
  body: string;
  bullets: string[];
  href: string;
}

export interface ProductGlossaryTerm {
  term: string;
  meaning: string;
}

export const PRODUCT_ROLE_PATHS: ProductRolePath[] =
  knowledgeBase.app.help.rolePaths.map((path) => ({
    slug: path.id,
    role: path.role,
    summary: path.summary,
    firstSteps: [...path.firstSteps],
    href: path.href,
  }));

export const PRODUCT_PAGE_HELP: ProductPageHelp[] =
  knowledgeBase.app.help.pageHelp.map((help) => ({
    routes: [...help.routes],
    title: help.title,
    purpose: help.purpose,
    nextStep: help.nextStep,
    commonMistake: help.commonMistake,
    href: help.href,
  }));

export const PRODUCT_FIELD_HELP: ProductFieldHelp[] =
  knowledgeBase.app.help.fieldHelp.map((help) => ({
    key: help.id,
    label: help.label,
    body: help.body,
    example: help.example,
  }));

export const PRODUCT_GLOSSARY: ProductGlossaryTerm[] =
  knowledgeBase.app.help.glossary.map((entry) => ({
    term: entry.term,
    meaning: entry.meaning,
  }));

export const PRODUCT_HELP_TOPICS: ProductHelpTopic[] =
  knowledgeBase.app.help.topics.map((topic) => ({
    slug: topic.id,
    title: topic.title,
    summary: topic.summary,
    category: topic.category,
    audience: topic.audience,
    timeEstimate: topic.timeEstimate,
    relatedRoutes: [...topic.relatedRoutes],
    sections: topic.sections.map((section) => ({
      heading: section.heading,
      body: section.body,
      steps: section.steps ? [...section.steps] : undefined,
    })),
    glossaryTerms: [...topic.glossaryTerms],
  }));

export const PRODUCT_CONTEXTUAL_HELP: Record<string, ContextualHelp> = {
  dashboard: {
    title: "Start here",
    body: "The dashboard is your checklist. Finish one setup step at a time; you do not need to understand every page today.",
    bullets: [
      "Settings tells Gavelhouse which community you manage.",
      "Homeowners should come before dues.",
      "Reports become useful after financial data is entered.",
    ],
    href: "/help",
  },
  settings: {
    title: "Community setup help",
    body: "Use Settings for basic community information and board invitations. A two-letter state code lets Gavelhouse show state-specific compliance guidance.",
    bullets: [
      "Use the community's legal or commonly used name.",
      "State should look like CA, TX, FL, or NY.",
      "Invite one person at a time so roles stay clear.",
    ],
    href: "/help/first-day-setup",
  },
  homeowners: {
    title: "Roster import help",
    body: "This page is for the homeowner list. If the CSV import feels intimidating, paste just a few rows first and check the result.",
    bullets: [
      "Column names must match the example on the page.",
      "Email is used for owner records and portal links.",
      "You can fix row errors and import again.",
    ],
    href: "/help/homeowner-roster",
  },
  reserves: {
    title: "Reserve study help",
    body: "This page turns a reserve study into a board-readable funding view. You can import CSV or JSON.",
    bullets: [
      "Use the latest reserve study when possible.",
      "Replacement cost means the future cost of the component.",
      "Import errors usually mean a column or number needs cleanup.",
    ],
    href: "/help/reserve-study-import",
  },
  dues: {
    title: "Dues setup help",
    body: "Create assessments after homeowners are loaded. The preview shows what Gavelhouse will create before you confirm.",
    bullets: [
      "Use operating for regular dues.",
      "Use reserve when the charge is meant for reserves.",
      "Mark paid only after payment is confirmed.",
    ],
    href: "/help/dues-and-assessments",
  },
  bankStatements: {
    title: "Bank statement help",
    body: "Upload a bank CSV so the treasurer can reconcile the bank account against Gavelhouse records.",
    bullets: [
      "Add a bank account before uploading.",
      "Beginning and ending balances should match the statement.",
      "Reconcile after upload to confirm the records match.",
    ],
    href: "/help/bank-statements",
  },
  auditPack: {
    title: "Download help",
    body: "Audit packs download as ZIP files. If nothing seems to happen, check the browser downloads arrow or your Downloads folder.",
    bullets: [
      "Pick the date range first.",
      "Open the ZIP file after download.",
      "Share the files inside with the board or auditor.",
    ],
    href: "/help/audit-pack-download",
  },
  ownerPortal: {
    title: "Owner portal help",
    body: "The owner portal is a simple view for homeowners. It shows assessment and request information from the board.",
    bullets: [
      "Use the latest link from the board.",
      "Ask the board for a new link if it expires.",
      "Contact the board if something looks wrong.",
    ],
    href: "/help/owner-portal",
  },
};

export const PRODUCT_ONBOARDING_STEPS = [
  {
    title: "Confirm the community",
    body: "Open Settings and make sure the community name and state are correct.",
    href: "/settings",
  },
  {
    title: "Add homeowners",
    body: "Import or add the homeowner roster before creating dues or generating portal links.",
    href: "/governance/homeowners",
  },
  {
    title: "Set up reserves",
    body: "Import reserve study information so the board can see funding and compliance.",
    href: "/finance/reserves",
  },
  {
    title: "Create dues",
    body: "Create the first assessment batch after homeowners are loaded.",
    href: "/finance/dues",
  },
  {
    title: "Download board records",
    body: "When the month or year is ready, download an audit pack for board files.",
    href: "/reports/audit-pack",
  },
] as const;

export function getProductHelpTopic(
  slug: string,
): ProductHelpTopic | undefined {
  return PRODUCT_HELP_TOPICS.find((topic) => topic.slug === slug);
}

export function getProductHelpTopicsForRoute(
  route: string,
): ProductHelpTopic[] {
  return PRODUCT_HELP_TOPICS.filter((topic) =>
    topic.relatedRoutes.includes(route),
  );
}

function normalizeHelpKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRoute(value: string): string {
  const [path] = value.trim().toLowerCase().split(/[?#]/, 1);
  return path.replace(/\/+$/, "");
}

function slugifyRole(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPageHelpForRoute(
  route: string,
): ProductPageHelp | undefined {
  const normalizedRoute = normalizeRoute(route);

  return PRODUCT_PAGE_HELP.find((help) =>
    help.routes.some(
      (candidate) => normalizeRoute(candidate) === normalizedRoute,
    ),
  );
}

export function getFieldHelp(key: string): ProductFieldHelp | undefined {
  const normalizedKey = normalizeHelpKey(key);

  return PRODUCT_FIELD_HELP.find(
    (help) => normalizeHelpKey(help.key) === normalizedKey,
  );
}

export function getProductHelpRolePath(
  role: string,
): ProductRolePath | undefined {
  const normalizedRole = normalizeHelpKey(role);
  const slugRole = slugifyRole(role);

  return PRODUCT_ROLE_PATHS.find((path) => {
    const roleSlug = path.slug;
    return (
      normalizeHelpKey(path.role) === normalizedRole ||
      roleSlug === normalizedRole ||
      roleSlug === slugRole
    );
  });
}

export function searchProductHelpTopics(query: string): ProductHelpTopic[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return PRODUCT_HELP_TOPICS;

  return PRODUCT_HELP_TOPICS.filter((topic) => {
    const haystack = [
      topic.title,
      topic.summary,
      topic.category,
      topic.audience,
      ...topic.sections.flatMap((section) => [
        section.heading,
        section.body,
        ...(section.steps ?? []),
      ]),
      ...topic.glossaryTerms,
    ]
      .join("")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

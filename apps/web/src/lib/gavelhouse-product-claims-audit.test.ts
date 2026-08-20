import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "../../../..");
const contentRoot = join(repoRoot, "apps/web/src/content");
const productPagesDir = join(repoRoot, "apps/web/src/content/product-pages");

const unsupportedGavelhouseClaimsByFile = mergeListEntries<string>([
  [
    "hoa-work-order-software.md",
    [
      "Resident maintenance request submission with photo attachments and status notifications",
      "Work order assignment and vendor management with licensed contractor tracking",
      "Fund coding enforcement: operating vs reserve classification applied automatically based on work type",
      "Completion tracking and documentation with payment linkage to the correct fund ledger",
      "Gavelhouse enforces that coding at the point of submission",
      "Gavelhouse lets the board split the work order across funds",
      "Gavelhouse keeps vendor records inside the work order workflow",
      "When a vendor is assigned to a job, their credentials are visible",
      "When an insurance certificate expires, the system flags it",
    ],
  ],
  [
    "hoa-violation-tracking-software.md",
    [
      "escalated violations",
      "notice generation with cure period timers",
      "certified mail option",
      "Fine schedule automation",
      "Hearing management",
      "State-compliant notice templates",
      "Board-side follow-up notes",
      "recording board notes",
      "use Gavelhouse status history",
      "block a fine from posting",
      "remind the secretary that a hearing notice was never sent",
      "enforces the procedural steps automatically",
      "keeps every document, photo, and timestamp in one place",
      "one audit trail to produce",
      "Exportable governance records",
      "Exportable violation records",
      "generating a compliant written notice",
      "starting a cure period timer",
      "applying the fine schedule only after required steps are completed",
      "Generated from state-compliant templates with cure period timer started automatically",
      "fine schedule cannot trigger until cure period has elapsed",
      "Hearing notice logged, owner response recorded, outcome tied to the violation record",
    ],
  ],
  [
    "hoa-website-software.md",
    [
      "online access to documents, payments, announcements, and maintenance requests",
      "community documents, account balances, dues payments, maintenance requests, and board announcements",
      "publishing them on a homeowner portal satisfies that requirement electronically",
      "document library, announcements, contact information, payment access",
      "Homeowner portal with a document library",
      "Announcement board and community-wide communications",
      "Maintenance request submission with status tracking",
      "Centralized document storage accessible from the homeowner portal",
      "Board-controlled announcement feed broadcast to all homeowners",
      "Request submission with board-side status visibility",
      "Violation tracking visible to the relevant homeowner from the portal",
    ],
  ],
  [
    "hoa-collections-software.md",
    [
      "enforce collections policy with automated notice sequences",
      "automated payment reminders",
      "built-in notice sequence",
      "flags missed plan payments automatically",
      "packages the complete account history, notice log",
      "Automated reminder sent at configured interval",
      "Notice generated from template, timestamped, logged to account history",
      "attorney packet pre-populated",
      "Full account history and notice log exported in one step for counsel",
      "generating consistent follow-up",
      "enforce the sequence automatically",
      "notice log built into the account",
      "mechanism for automatically flagging",
    ],
  ],
  [
    "best-hoa-violation-tracking-software.md",
    [
      "tracking software enforces that due-process workflow automatically",
      "fine schedule that applies automatically",
      "Violations feed into owner ledgers",
      "cure-period tracking is automatic",
      "Fine revenue posts to the operating fund",
      "Cure-period tracking with automatic status escalation",
      "Notice templates cite governing document sections",
      "Fines post automatically to owner ledgers",
      "Full timestamped audit trail for every status change and communication",
      "Fine Automation",
      "Yes -- posts to fund accounting",
      "Gavelhouse covers the full workflow from photo evidence through fine posting",
      "When a fine is assessed after the cure period, it posts",
      "notice templates are structured",
      "Gavelhouse enforces the connection",
    ],
  ],
  [
    "hoa-violation-enforcement-guide.md",
    [
      "Every notice generates a timestamped record",
      "The hearing workflow prompts",
      "The fine imposition links back",
      "complete chronological record of every action taken",
      "Gavelhouse's enforcement workflow around what the statutes actually require",
    ],
  ],
  [
    "hoa-enforcement-software.md",
    [
      "Gavelhouse documents every violation with timestamps, photos, and notice records",
      "Gavelhouse documents every violation with a complete due process timeline",
      "Due process timeline tracked automatically",
      "Consistent violation letters generated from templates",
      "Hearing outcomes recorded and linked to the original violation",
      "Enforcement history exportable for legal proceedings",
      "Gavelhouse's enforcement workflow enforces consistency",
      "which triggers the notice template",
      "Gavelhouse tracks the due process timeline automatically",
      "Gavelhouse connects violation fines to the homeowner's financial record automatically",
      "Gavelhouse attaches photos to violation records with\n      automatic date-time stamping",
      "Gavelhouse stores this documentation in the violation\n      record automatically",
      "Every violation documented with date, time, description, photo evidence,\n        and notice status in a searchable record",
      "Gavelhouse structures violation records to contain:",
      "The photo is date-time stamped automatically",
      "stored as a document record",
      "A copy of the notice is attached to the record",
      "This links directly to the financial record",
    ],
  ],
  [
    "hoa-vendor-contract-checklist.md",
    [
      "vendor management module in Gavelhouse",
      "Gavelhouse's vendor management workflow",
      "expiration date, renewal notice window, and COI refresh date are tracked",
      "treasurer can pull up every active vendor relationship",
    ],
  ],
  [
    "hoa-board-liability-protection-guide.md",
    ["tracks vendor contracts and approval processes"],
  ],
  [
    "best-hoa-website-builders.md",
    [
      "document library, announcement board, and payment portal included",
      "Homeowner portal includes document library and announcements",
      "covers the homeowner portal, document library, announcements, and dues payment",
      "Gavelhouse's homeowner portal includes the document library, announcements, and payment portal",
      "keeps documents, announcements, payments",
      "needs everything -- website, portal, dues collection, and financial management",
      "a dedicated HOA platform like Gavelhouse avoids paying for multiple tools",
    ],
  ],
  [
    "best-hoa-portal-software.md",
    [
      "document management, homeowner communication, and compliance tracking",
      "document management, and homeowner communication are integrated",
      "Homeowner portal for dues payment, document access, and communication",
      "Financial reports formatted for annual meetings and state reserve disclosures",
    ],
  ],
  [
    "hoa-website-guide.md",
    [
      "public-facing document access and the authenticated homeowner portal in a single system",
    ],
  ],
  [
    "hoa-document-management-guide.md",
    [
      "Gavelhouse's document management",
      "Gavelhouse stores meeting minutes, board votes, financial records, and governing documents",
      "searchable, organized system with audit trails",
      "Records are automatically categorized",
      "generate the relevant records in minutes",
      "Import your governing documents",
      "system organizes everything by type and date automatically",
    ],
  ],
  [
    "hoa-records-inspection-rights.md",
    [
      "records management into Gavelhouse's secretary and administrator workflows",
      "document storage organized by category",
    ],
  ],
  [
    "va-condo-approval-guide.md",
    [
      "document management and financial tracking tools",
      "central place for governing documents and insurance certificates",
      "maintain insurance certificate records",
      "reserve contribution tracking that surfaces when the board is drifting from the reserve study's recommendation",
    ],
  ],
  [
    "hoa-architectural-review-software.md",
    [
      "homeowners upload plans, photos, and supporting documents",
      "Deadline tracking with automatic deemed-approved warnings",
      "individual vote recording",
      "Decision archive and precedent library",
      "CC&R deadline passes before anyone flags it",
      "ARC workflow in Gavelhouse connects",
      "Structured submission portal with photos and documents in one record",
      "Automatic countdown with warning alerts",
      "Individual votes logged with comments",
      "Searchable archive by property, request type, and ruling",
    ],
  ],
  [
    "hoa-architectural-review-process.md",
    [
      "document management module stores architectural applications",
      "The committee log is built in",
      "Applications log their receipt date automatically",
      "surface pending decisions before they age past",
      "Gavelhouse's document management tracks CC&Rs",
    ],
  ],
  [
    "hoa-solar-panel-rules-by-state.md",
    [
      "solar application path to enforce a defined checklist",
      "Gavelhouse's document storage keeps the application",
      "complete record, not a folder",
      "compliance calendar flags statutory deadlines",
    ],
  ],
  [
    "buildium-hoa-vs-gavelhouse.md",
    [
      "Gavelhouse generates the required disclosure",
      "Reserve percent-funded dashboard",
      "reserve percent-funded dashboard updates automatically",
      "software that calculates and surfaces this number",
      "Export the audit report in one click",
    ],
  ],
  [
    "fannie-mae-hoa-reserve-requirements.md",
    [
      "Gavelhouse tracks percent-funded status against both state requirements and Fannie Mae thresholds",
      "flagging when funding levels approach non-compliance",
      "calculates your allocation percentage automatically",
      "shows how it trends over time",
      "flags when you approach the 15% threshold",
    ],
  ],
  [
    "post-surfside-hoa-legislation-tracker.md",
    [
      "Gavelhouse tracks reserve fund status against state-specific requirements",
      "alerts boards when funding levels approach non-compliance thresholds",
      "Gavelhouse tracks this automatically and flags when you approach the threshold",
    ],
  ],
  [
    "best-reserve-study-software-2026.md",
    [
      "They calculate percent-funded status, flag funding gaps, and generate the reserve compliance reports",
      "Gavelhouse calculates it automatically as contributions and withdrawals are recorded",
    ],
  ],
  [
    "gavelhouse-vs-payhoa.md",
    [
      "Gavelhouse surfaces state-specific reserve requirements within the platform",
      "percent-funded tracking, and compliance documentation",
      "reserve adequacy tracking against a reserve study",
      "state-specific reserve reporting",
      "surfacing percent-funded status and compliance alerts",
      "Yes (vs. reserve study projections)",
    ],
  ],
  [
    "gavelhouse-vs-quickbooks.md",
    [
      "Yes -- tracks balance vs reserve study target",
      "HOA-specific compliance reports",
      "State Compliance Reports\n      - 'No'\n      - Yes (state-specific)",
      "Reserve Study Integration\n      - 'No'\n      - 'Yes'",
      "Percent-Funded Tracking\n      - 'No'\n      - 'Yes'",
      "compliance reports --",
      "covers both fund accounting and compliance reporting",
    ],
  ],
  [
    "condocontrol-vs-gavelhouse.md",
    [
      "Reserve percent-funded tracking\n      - 'No'\n      - 'Yes'",
      "State-specific compliance\n      - Limited\n      - 'Yes'",
      "reserve compliance dashboard",
    ],
  ],
  [
    "hoa-financial-management-software.md",
    [
      "tracks reserve percent-funded automatically",
      "generates the financial reports your state requires",
      "Reserve percent-funded dashboard always current",
      "One-click budget vs. actual report",
      "does not calculate reserve percent-funded automatically",
      "does not generate the state-specific compliance reports",
      "Gavelhouse generates these reports",
      "Gavelhouse handles your day-to-day bookkeeping, monthly reconciliation",
      "Automatic monthly bank reconciliation",
      "exception flagging for transactions that need review",
      "calculate your reserve percent-funded against your reserve study automatically",
      "calculates percent-funded automatically",
      "dashboard shows the current figure at all times",
      "reconciles by connecting to your bank account directly",
      "Transactions import automatically",
      "reconciled data feeds directly into your financial reports",
      "reserve percent-funded history is a continuous record",
      "export them directly",
      "complete and searchable",
    ],
  ],
  [
    "reserve-study-rfp-template.md",
    [
      "How Gavelhouse Integrates Reserve Study Data",
      "reserve module imports the component inventory",
      "tracks your actual reserve fund balance against the study's projected balance month by month",
      "pre-populates the reserve contribution line item",
      "Gavelhouse flags it before it expires",
      "exports as a structured file",
      "study data import, monthly balance tracking, and compliance alerts",
    ],
  ],
  [
    "50-state-reserve-fund-requirements.md",
    [
      "tracks reserve fund compliance against both state-specific requirements and Fannie Mae thresholds",
      "flags when funding levels approach non-compliance",
      "automated compliance tracking ensures",
    ],
  ],
  [
    "hoa-collections-policy-template.md",
    [
      "the software enforces them automatically",
      "tracks every notice date",
      "every escalation step in a timestamped audit log",
    ],
  ],
  [
    "lead-magnets/hoa-collections-policy-template.md",
    [
      "Does Gavelhouse automate any part of the collections workflow?",
      "Yes. Gavelhouse tracks each unit's assessment payment status, flags",
      "timestamped audit trail of every notice sent",
      "escalation action taken",
    ],
  ],
  [
    "community-financials-vs-gavelhouse.md",
    [
      "surfaces reserve percent-funded without requiring manual setup",
      "State-specific reserve compliance",
      "Reserve percent-funded dashboard",
      "Annual compliance reporting\n      - Manual\n      - Automated",
      "reserve percent-funded calculation waiting for your opening balances",
      "Reserve percent-funded tracking is automatic",
      "annual compliance reporting features generate the documents your state requires",
      "generate a sample reserve disclosure",
    ],
  ],
  [
    "appfolio-vs-hoalife.md",
    ["State-specific compliance reporting is built in"],
  ],
  [
    "doorloop-vs-payhoa.md",
    [
      "Reserve adequacy is tracked against the study projection",
      "State-specific disclosure reports are generated automatically",
    ],
  ],
  [
    "gavelhouse-vs-quickbooks.md",
    [
      "integrates reserve study data directly",
      "percent-funded ratio in the same view",
      "Annual meeting disclosures include the percent-funded figure",
    ],
  ],
  [
    "hoa-newsletter-software.md",
    [
      "professional templates, delivery tracking",
      "full communication archive",
      "replaces ad-hoc Word docs and personal email blasts",
      "structured HOA newsletter tools",
      "permanent archive that protects the board",
      "Gavelhouse includes newsletter and notice templates",
      "Every communication sent through Gavelhouse generates",
      "Professional newsletter templates formatted for HOA communications",
      "Delivery tracking shows which homeowners received",
      "Full archive of every newsletter and notice sent",
      "We built the communication tools in Gavelhouse",
      "Gavelhouse lets you link directly to documents stored in the system",
      "Gavelhouse's communication system timestamps every outgoing communication",
      "Gavelhouse reduces this burden by providing templates",
      "Gavelhouse solves this structurally",
      "Gavelhouse connects communications to the underlying records",
      "communication tools in Gavelhouse are available",
      "newsletter and notice tools",
      "association email identity in Gavelhouse",
    ],
  ],
  [
    "condo-hoa-software.md",
    [
      "Reserve fund percent-funded dashboard updated automatically",
      "Condo-specific reserve component tracking",
      "Violation management with notice templates, cure periods",
      "Financial reports formatted for Fannie Mae reviews and lender",
      "tracks reserve components and funding levels",
      "remaining useful life",
      "percent-funded status and flags components",
      "generates reserve fund reports showing current balance",
      "tracks whether your contribution rate meets this threshold",
      "Each violation record tracks the inspection date",
      "notice sent, cure deadline, hearing scheduled",
      "violation workflow tracks each case from initial inspection through resolution",
      "Every notice is logged with a timestamp",
      "Cure periods are tracked",
      "Hearing dates are scheduled from within the system",
      "Fine assessments are linked to the owner's account",
      "Gavelhouse tracks all of these figures in one place",
      "Reserve balance, annual assessment income, reserve contribution percentage, and reserve fund history are all stored and reportable",
      "import your reserve component data, run the percent-funded calculation",
      "Gavelhouse gives condo boards the reserve compliance",
      "violation tracking tools that generic HOA software misses",
    ],
  ],
  [
    "condo-board-software.md",
    [
      "Reserve fund tracking enforces contributions against the required funding schedule",
      "flags deficiencies before they become violations",
      "Reserve compliance rules can be configured to reflect state-specific mandates",
      "structural integrity reserve study inputs and funding progress separately",
    ],
  ],
  [
    "townhome-hoa-software.md",
    [
      "reserve line-item tracking by component",
      "automated escalation notices",
      "Per-component reserve tracking tied to the reserve study",
      "Automated late-notice workflow with a full audit log",
    ],
  ],
  [
    "hoa-payment-collection-software.md",
    [
      "reconcile automatically in Gavelhouse",
      "after the automated notice cycle",
      "every notice sent -- can be exported",
      "Gavelhouse sends automatic reminders on the schedule you configure",
      "Late notices go out automatically on the grace period expiration date",
      "Gavelhouse automates dues collection, sends late notices",
      "Gavelhouse sends automatic due date reminders",
      "triggers a late notice workflow",
      "Gavelhouse applies late fees automatically",
      "The system handles the routine cases automatically",
    ],
  ],
  [
    "managing-hoa-software.md",
    [
      "complete collections history",
      "compliance calendar with upcoming deadlines",
      "Gavelhouse's compliance calendar tracks these obligations",
      "flags them before they become violations",
      "Gavelhouse tracks delinquencies by homeowner and unit, sends automated",
      "reminder notices on a schedule you define",
      "prepares lien documentation when escalation is needed",
      "Gavelhouse automates the collections workflow",
      "when to escalate to lien preparation",
    ],
  ],
  [
    "condo-association-software.md",
    [
      "Reserve fund compliance dashboard tracks structural and non-structural",
      "with alerts when contribution waivers are",
      "Homeowner portal gives unit owners access to financial statements",
      "Structural reserve categories tracked separately with compliance alerts",
      "Study import and renewal timeline alerts",
      "Contribution rate tracked against gross assessment total",
      "Homeowner portal with real-time access to approved financial statements",
      "allows boards to define reserve categories at the required level of specificity",
      "structural component categories that Florida SB 154 mandates",
      "Contributions and balances track by category",
      "structural reserve adequacy separately from non-structural reserve components",
    ],
  ],
  [
    "hoa-compliance-software.md",
    [
      "Reserve compliance dashboard shows current percent-funded",
      "Automatic state requirement alerts notify your board",
      "Real-time dashboard against reserve study baseline",
      "Automatic alerts when reserve statutes change in your state",
      "Board-ready financial reports generated automatically",
      "Contribution shortfall alerts before the gap becomes a crisis",
      "tracks reserve statutes across states and surfaces alerts",
      "flags new thresholds",
      "uses your study's recommended annual contribution and current reserve balance to calculate percent-funded status",
      "Gavelhouse will flag that gap",
      "Import your reserve study's annual contribution schedule and current balance targets",
      "Show percent-funded in real time",
      "State compliance alerts",
      "Surface changes to reserve statutes in your jurisdiction",
    ],
  ],
  [
    "california-davis-stirling-reserve-requirements.md",
    [
      "Reserve study findings feed directly into the budget reporting workflow",
      "required annual disclosures generate automatically",
    ],
  ],
  [
    "colorado-hoa-hb24-1233-summary.md",
    [
      "reserve funding plan module lets boards document target contributions",
      "generate the annual reserve status summary required for the HB24-1233 disclosure",
      "board gets a reminder before the deadline lapses",
    ],
  ],
  [
    "florida-milestone-inspection-law-for-hoas.md",
    [
      "Gavelhouse tracks inspection deadlines against building certificate of occupancy dates",
      "connects milestone inspection timelines to the SIRS reserve funding schedule",
      "generates the documentation boards need for annual meeting disclosure",
    ],
  ],
  [
    "montana.md",
    [
      "provides capital tracking tools to help new boards build a reserve plan from scratch",
      "generates the documentation that supports a business judgment rule defense",
    ],
  ],
  [
    "alternatives/associaonline.md",
    [
      "handles reserve fund separation, reserve study tracking, and state-specific",
      "reserve study tracking and compliance alerts",
      "tracks reserve study targets against actual balances",
      "State-specific reserve requirement alerts so volunteer treasurers know",
      "Reserve study tracking integrates into the accounting view",
      "tracks actual reserve balances against those targets",
      "State-specific reserve requirement alerts notify the board",
    ],
  ],
  [
    "hoa-reserve-fund-software.md",
    [
      "Gavelhouse calculates this automatically using your reserve study",
      "calculates funding trajectories",
      "component-level funding trajectory",
      "dashboard flags it",
      "lets you set threshold alerts",
      "QuickBooks does not know your reserve study targets. Gavelhouse does.",
      "reserve expenditure workflow requires board authorization before funds are disbursed",
      "Gavelhouse calculates the fully funded balance",
    ],
  ],
  [
    "hoa-website-builder.md",
    [
      "Gavelhouse's document library treats access as a system-level property",
      "Access levels are configurable by document category",
      "notification sent to homeowners",
      "Gavelhouse's contact forms route based on inquiry type",
      "Each submission creates a record in the system",
      "meeting minutes are approved and filed in the document library",
      "homeowners who opted in should receive notification",
      "propagates to all the places homeowners and board members need to see it",
      "community website and homeowner portal as part of the standard subscription",
      "website builder and homeowner portal",
      "document access and account balance visibility",
      "controls access based on verified homeownership",
      "homeowner portal includes a request submission form",
      "routes to the appropriate board member or committee",
      "supports public-facing community pages",
      "Gavelhouse's community website tools",
      "submit a maintenance request that creates a trackable record",
    ],
  ],
  [
    "hoa-self-management-platform.md",
    [
      "self-service access to their account balance, payment history, governing documents, meeting minutes, and upcoming events",
      "Common requests can be submitted through the portal",
      "Gavelhouse tracks reserve study update requirements",
      "annual meeting notice deadlines, budget adoption timelines, insurance renewal windows, and state-specific disclosure requirements",
      "compliance calendar is updated as state law changes",
      "Every function a self-managed HOA needs to operate",
      "violation enforcement, document storage, homeowner communications, compliance tracking",
      "Gavelhouse's compliance calendar tracks these deadlines by state",
      "calendar flags upcoming obligations",
    ],
  ],
  [
    "pricing-breakdowns/caliber-software.md",
    [
      "Reserve fund compliance, state-specific requirements, and board member liability protection are the core design priorities",
    ],
  ],
  [
    "pricing-breakdowns/enumerate.md",
    ["reserve tracking, and state-specific compliance"],
  ],
  [
    "pricing-breakdowns/payhoa.md",
    ["reserve study tracking, and state-specific compliance dashboards"],
  ],
  [
    "pricing-breakdowns/propertyboss.md",
    [
      "state-specific reserve requirement guidance, and financial reporting for board meetings",
    ],
  ],
  [
    "pricing-breakdowns/cinc.md",
    ["homeowner portals, and violation management. starting at $29/mo"],
  ],
  [
    "pricing-breakdowns/cinc-pro.md",
    [
      "homeowner portals, and violation management appear in both platforms",
      "Reserve fund compliance is enforced at the database layer",
    ],
  ],
  [
    "pricing-breakdowns/pilera.md",
    [
      "operations tools (homeowner portal, document management, communications, violation tracking) that Pilera covers",
      "built-in reserve fund compliance",
    ],
  ],
  [
    "pricing-breakdowns/topssystems.md",
    [
      "reserve fund compliance, operating and reserve fund separation, and state-specific requirements",
      "Reserve fund compliance is included at every tier",
    ],
  ],
  [
    "pricing-breakdowns/associaonline.md",
    [
      "reserve fund compliance tracking, homeowner dues collection, document management, meeting minutes, and homeowner portals",
    ],
  ],
  [
    "pricing-breakdowns/vantaca.md",
    ["reserve fund compliance included at every tier"],
  ],
  [
    "pricing-breakdowns/runhoa.md",
    ["reserve fund compliance tools and verifiable reliability"],
  ],
  ["pricing-breakdowns/buildium.md", ["covers reserve fund compliance at"]],
  ["pricing-breakdowns/hoa-express.md", ["reserve fund compliance included"]],
  [
    "pricing-breakdowns/frontsteps.md",
    [
      "board treasurer managing reserve fund compliance",
      "primarily concerned with reserve fund compliance",
    ],
  ],
  ["alternatives/vantaca.md", ["provides reserve fund compliance tracking"]],
  [
    "alternatives/buildium.md",
    ["covers reserve fund compliance at annual plans"],
  ],
  [
    "alternatives/clickpay.md",
    [
      "reserve fund compliance included from day one",
      "Gavelhouse covers the full compliance picture",
      "Reserve study targets track over time",
      "Gavelhouse handles payments and compliance",
    ],
  ],
  [
    "alternatives/hoa-express.md",
    [
      "financial management, reserve fund compliance, and dues",
      "compliance tracking included at every tier",
    ],
  ],
  [
    "pricing-breakdowns/vinteum.md",
    ["Gavelhouse covers financial management and reserve compliance"],
  ],
  [
    "hoa-board-portal.md",
    [
      "pre-configure the compliance reporting features relevant to your jurisdiction",
      "document library imports your existing files",
      "homeowner directory populates from a simple import",
      "minutes get uploaded after meetings",
      "violations get logged when they happen",
      "reserve percent-funded status from any device",
      "homeowners can self-serve the documents they are legally entitled to",
      "notice was sent on this date",
      "response window expired, and the hearing was scheduled",
      "Architectural modification request submission and status tracking",
      "Maintenance concern submissions",
      "submit architectural requests, flag maintenance concerns",
    ],
  ],
  [
    "hoa-architectural-control-committee.md",
    [
      "handles ACC request tracking, deadline monitoring, and decision archiving",
      "same platform where you manage finances, violations, and documents",
    ],
  ],
  [
    "arizona.md",
    [
      "track reserve fund balances against study projections",
      "flag when contributions fall behind plan",
      "generate the documentation a board needs to show it acted",
    ],
  ],
  [
    "illinois.md",
    [
      "track their reserve study's recommendations against actual reserve contributions",
      "flag when the board deviates from the study's plan",
      "generate the disclosure documentation required by 765 ILCS 605/9(c)(1)",
    ],
  ],
  [
    "north-carolina.md",
    [
      "track reserve balances against a capital plan",
      "flag contribution shortfalls before they become crisis-level deficits",
      "generate the documentation a board needs to show it met its statutory obligations",
    ],
  ],
  [
    "north-carolina-planned-community-act.md",
    [
      "reserve tracking module lets boards model component replacement timelines",
      "flag when the fund is tracking below the level needed",
      "generate the documentation trail that demonstrates",
      "can generate a disclosure snapshot",
      "produce a resale certificate package",
      "reserve tracking module calibrated",
    ],
  ],
  [
    "virginia-poa-act-reserve-rules.md",
    ["automates the disclosure data you need"],
  ],
  [
    "washington-state-reserve-study-law.md",
    [
      "Reserve contribution schedules, fund balances, and study documentation attach to the fiscal year record",
    ],
  ],
  [
    "hoa-board-succession-crisis.md",
    [
      "percent-funded status, upcoming assessment deadlines",
      "compliance deadlines, and financial reports carry forward automatically",
    ],
  ],
  [
    "hoa-collection-policy-template.md",
    [
      "flag accounts that pass the grace period, track notice deadlines",
      "generate the itemized balance statements required by pre-lien notice statutes",
    ],
  ],
  [
    "hoa-delinquent-account-procedures.md",
    ["aging schedule and delinquency escalation tracking into Gavelhouse"],
  ],
  [
    "hoa-reserve-study-explained.md",
    [
      "shows you your current reserve position against your study's recommended targets",
      "map it directly into Gavelhouse's reserve tracking dashboard",
    ],
  ],
  [
    "reserve-study-software-comparison.md",
    ["reserve balance tracking against study projections"],
  ],
  [
    "hoa-management-companies-guide.md",
    ["configure your reserve study contribution schedule"],
  ],
  [
    "hoa-rental-restrictions-guide.md",
    [
      "What Gavelhouse tracks for rental restriction compliance",
      "rental restriction tracking into Gavelhouse's compliance module",
      "maintains a unit-level rental status log",
      "generates lease registration notices and fee invoices automatically",
    ],
  ],
  [
    "hoa-newsletter-templates.md",
    [
      "Gavelhouse offers a free newsletter template",
      "Download it from the resources section of gavelhouse.app",
    ],
  ],
  [
    "hoa-property-manager-software.md",
    [
      "keeps the fund separation and contribution tracking current without manual intervention",
    ],
  ],
  [
    "master-association-software.md",
    ["For more on the reserve compliance layer"],
  ],
  [
    "what-are-ccrs.md",
    [
      "We built Gavelhouse because boards were struggling to track which governing document controlled which issue",
      "Centralizing your CC&Rs, tracking violations",
    ],
  ],
  [
    "hoa-budget-guide.md",
    [
      "reserve study integration means the contribution line populates from your funding plan",
    ],
  ],
  [
    "hoa-budget-template-guide.md",
    ["The reserve contribution line pulls from the reserve study funding plan"],
  ],
  [
    "hoa-ccr-covenants-guide.md",
    [
      "Gavelhouse stores your governing document stack",
      "tracks amendment history",
      "logs enforcement actions against individual lots",
      "surfaces the state-specific requirements that apply to your community",
    ],
  ],
  [
    "hoa-fees-guide.md",
    [
      "budget module to pull the reserve study's annual contribution recommendation directly",
      "You can see the reserve funded percentage",
    ],
  ],
  [
    "hoa-fine-schedule-template.md",
    [
      "tracks active violations, cure periods, and fine accruals",
      "start the cure period clock, and schedule the fining committee hearing",
      "system flags when aggregate caps are approaching",
      "The audit trail Gavelhouse maintains -- who issued the notice",
    ],
  ],
  [
    "alternatives/easyhoa.md",
    [
      "Reserve fund tracking is a first-class feature from the first tier",
      "reserve study targets track over time",
    ],
  ],
  [
    "hoa-insurance-claim-process-guide.md",
    [
      "centralized record of claim correspondence, deadlines, financial transactions, and board decisions",
    ],
  ],
  [
    "hoa-management-platform-guide.md",
    [
      "Reserve tracking maps your study's contribution schedule directly to your monthly actuals",
      "compliance calendar surfaces state-specific deadlines",
    ],
  ],
  [
    "hoa-property-management-near-me.md",
    [
      "automating the financial tracking, compliance calendar, and document management",
    ],
  ],
  [
    "hoa-self-management-guide.md",
    [
      "reserve fund tracking against the study",
      "meeting management that keeps the compliance calendar on track",
    ],
  ],
  [
    "hoa-special-assessment-notice-guide.md",
    [
      "reserve spending is tracked in real time against a reserve study",
      "see your funded percentage throughout the year",
    ],
  ],
  [
    "reserve-study-condo.md",
    [
      "reserve tracking module is designed for exactly this workflow",
      "map your reserve study's year-by-year contribution schedule directly into the platform",
    ],
  ],
  [
    "self-managed-vs-professional-hoa.md",
    [
      "tracks reserve compliance against state requirements and reserve study targets",
      "automates assessment tracking and delinquency notices",
      "generates the financial reports your board needs for annual meetings and state filings",
    ],
  ],
  [
    "why-financial-complexity-breaks-volunteer-hoa-boards.md",
    [
      "assessment tracking with automated delinquency management",
      "reserve compliance monitoring against state requirements and Fannie Mae thresholds",
      "financial report generation for annual meetings and audits",
    ],
  ],
  ["hoa-president-role-guide.md", ["agenda notices generated automatically"]],
  [
    "payhoa-vs-gavelhouse.md",
    [
      "State-specific compliance tracking is built in",
      "tracks your study schedule",
      "minimum funding thresholds, those are visible in your dashboard",
      "Gavelhouse surfaces state-specific reserve requirements within",
    ],
  ],
  [
    "hoalife-vs-gavelhouse.md",
    [
      "State reserve compliance tracking\n      - 'No'\n      - 'Yes'",
      "Percent-funded tracking\n      - 'No'\n      - 'Yes'",
      "Document storage\n      - 'Yes'\n      - 'Yes'",
      "Reserve study integration\n      - 'No'\n      - 'Yes'",
    ],
  ],
  [
    "runhoa-vs-easyhoa.md",
    [
      "reserve study integration, and the disclosure reporting their state requires",
    ],
  ],
  [
    "runhoa-vs-payhoa.md",
    [
      "offers reserve fund\n  tracking and state-specific compliance",
      "purpose-built compliance tools that both RunHOA and PayHOA lack",
      "reserve compliance tracking, and board-operable workflows",
    ],
  ],
  [
    "cinc-vs-buildium.md",
    [
      "Reserve fund compliance is enforced at the database layer",
      "State-specific reserve requirements are tracked against actual fund balances",
      "state-specific alerts for\n      communities",
    ],
  ],
  [
    "condo-control-vs-townsq.md",
    [
      "reserve compliance dashboard tracks fund balances against study targets",
      "state-specific reserve requirements are surfaced by default",
    ],
  ],
  [
    "vantaca-vs-cinc.md",
    [
      "Reserve fund compliance, fund separation, and state-specific alerts",
      "for reserve fund compliance and\n      financial management",
    ],
  ],
  [
    "vantaca-vs-appfolio.md",
    [
      "for reserve fund compliance,\n      fund separation",
      "state-specific fiduciary requirements",
    ],
  ],
  [
    "payhoa-alternatives.md",
    ["Best for Reserve Fund Compliance", "reserve fund compliance gap"],
  ],
  [
    "appfolio-vs-hoalife.md",
    [
      "left reserve compliance as a manual exercise",
      "state-specific compliance materials",
    ],
  ],
  [
    "condo-control-vs-payhoa-small-hoas.md",
    ["Yes (reserve compliance dashboard)"],
  ],
  ["alternatives/frontsteps.md", ["Reserve fund compliance alerts by state"]],
  [
    "alternatives/smartwebs.md",
    [
      "financial management and reserve compliance",
      "Enforced at database layer with state-specific alerts",
      "state-specific requirements -- Gavelhouse addresses those directly",
    ],
  ],
  [
    "gavelhouse-vs-townsq.md",
    [
      "Gavelhouse is purpose-built for reserve fund compliance",
      "tracks reserve\n      balances against reserve study projections",
      "generates\n      financial reports that align with what auditors and state regulators",
      "reserve study tracking, and compliance",
      "Built-in balance vs. projection tracking",
      "compliance reporting, and an owner",
      "track reserve balances against the projections",
      "Gavelhouse tracks your reserve fund balance against the projections",
    ],
  ],
  [
    "gavelhouse-vs-hoalife.md",
    ["reserve fund compliance built into the platform"],
  ],
  [
    "condocontrol-vs-gavelhouse.md",
    ["need reserve fund compliance,\n  financial governance"],
  ],
  [
    "condocontrol-alternatives.md",
    ["enforced reserve fund compliance and flat pricing"],
  ],
  [
    "condo-control-vs-townsq.md",
    [
      "Consider Gavelhouse if reserve fund compliance is a board priority",
      "compliance-first design handles",
    ],
  ],
  [
    "hoalife-vs-gavelhouse.md",
    [
      "reserve fund compliance and fund-level",
      "tracks state-specific requirements",
    ],
  ],
  [
    "massachusetts-chapter-183a-condo-law.md",
    [
      "reserve fund compliance tools, trustee duty",
      "resale certificate data exports",
      "generates reserve balance snapshots and budget exports",
    ],
  ],
  [
    "best-hoa-payment-software.md",
    [
      "Gavelhouse adds reserve fund compliance tracking",
      "automatic payment reminders and delinquency",
      "platform including reserve compliance",
    ],
  ],
  [
    "alternatives/pilera.md",
    [
      "State-specific compliance alerts for reserve funding requirements",
      "Reserve study target tracking against actual balances",
      "Built-in for reserve funding and study deadlines",
      "Target tracking with rollforward reporting",
      "Pilera does not include state-specific compliance alerts for these requirements. Gavelhouse does.",
    ],
  ],
  [
    "alternatives/cinc-pro.md",
    [
      "Reserve study targets are tracked against actual balances",
      "state-specific alerts when requirements change",
      "need reserve fund compliance, financial reporting",
      "covers the reserve compliance and financial reporting features",
    ],
  ],
  [
    "alternatives/runhoa.md",
    [
      "dedicated reserve fund compliance",
      "tracking, state-specific alerts",
      "Gavelhouse offers reserve fund compliance",
    ],
  ],
  [
    "vinteum-vs-payhoa.md",
    [
      "fills the compliance gap with dedicated",
      "reserve fund tracking and state-specific alerts",
      "reserve compliance tracking, and board-operable workflows",
    ],
  ],
  [
    "best-hoa-document-storage-software.md",
    [
      "Best for Integrated Compliance and Document Management",
      "Governing documents, meeting minutes, and financial records are stored in the same platform",
      "audit trail covers every document upload",
      "Gavelhouse handles both",
      "document storage, fund accounting, and reserve compliance are integrated in a single system",
    ],
  ],
  [
    "hoa-transfer-fee-disclosure.md",
    ["generates the disclosure statement for the resale package"],
  ],
  [
    "hoa-board-election-procedures.md",
    ["document management module stores election packages"],
  ],
  [
    "hoa-ev-charger-accommodation.md",
    [
      "document management module stores the adopted EV charger policy",
      "system flags them",
    ],
  ],
  [
    "hoa-bylaw-amendment-process.md",
    ["Gavelhouse stores meeting minutes alongside the governing documents"],
  ],
  ["hoa-conflict-of-interest-policy.md", ["Gavelhouse's document management"]],
  [
    "hoa-rules-and-regulations-guide.md",
    [
      "document management module keeps the operating rules document versioned",
      "system flags which owners have not yet acknowledged receipt",
    ],
  ],
  [
    "hoa-short-term-rental-policy.md",
    ["document management and violation tracking modules are built"],
  ],
  [
    "alternatives/pilera.md",
    [
      "Communication tools are simpler than Pilera (no automated violation\n    escalation workflows)",
      "Communication tools are simpler than Pilera (no automated violation\n        escalation workflows)",
    ],
  ],
  ["alternatives/vinteum.md", ["Gavelhouse addresses it directly"]],
  [
    "gavelhouse-vs-hoalife.md",
    [
      "Gavelhouse's violation management is functional",
      "- Reserve study tracking\n      - 'No'\n      - 'Yes'",
      "- Violation management\n      - Yes (primary strength)\n      - Yes (functional)",
      "- Homeowner communications\n      - 'Yes'\n      - 'Yes'",
      "- Document storage\n      - 'Yes'\n      - 'Yes'",
      "accounting, reserve tracking, homeowner management, and board operations",
      "reserve compliance, percent-funded tracking",
      "Reserve tracking is integrated with reserve study projections",
      "enforces reserve compliance by design",
    ],
  ],
  [
    "vinteum-vs-hoalife.md",
    [
      "Reserve balances stay visible for comparison with the board's reserve study",
    ],
  ],
  [
    "vinteum-vs-payhoa.md",
    ["with the compliance tools that both platforms lack"],
  ],
  [
    "best-condo-management-software.md",
    [
      "State-specific\n      reserve requirement tracking provides visibility",
      "State-specific reserve requirement tracking",
      "Homeowner portal for document access and communications",
      "Yes -- state-specific",
      "State-specific reserve requirement tracking compares your current reserve balance",
      "Gavelhouse covers dues collection, homeowner portals, document storage, violation tracking, and communications",
    ],
  ],
  [
    "hoa-board-portal.md",
    [
      "Gavelhouse centralizes your board documents, financial reports, violation\n  records, and homeowner communication",
      "Meeting minutes, complete document libraries, and external compliance files",
    ],
  ],
  [
    "best-community-association-management-software.md",
    [
      "tracks reserve compliance\n      against reserve study targets",
      "State-specific reserve requirement tracking",
      "Yes -- state-specific tracking",
    ],
  ],
  [
    "best-hoa-management-software-condos.md",
    [
      "Reserve compliance tracking displays your\n      current reserve balance against reserve study targets",
      "Reserve compliance tracking against state-specific thresholds",
      "Homeowner portal for document access and owner communications",
      "Yes -- state-specific",
    ],
  ],
  [
    "best-self-managed-hoa-software-2026.md",
    [
      "tracks compliance against reserve study targets",
      "surfaces compliance\n      status without requiring manual interpretation",
      "State-specific reserve requirement tracking",
      "Yes -- state-specific",
    ],
  ],
  [
    "hoa-management-software-comparison.md",
    [
      "Yes -- state-specific",
      "State-specific reserve requirement tracking shows you where your community stands relative to applicable thresholds",
      "homeowner portal with document access and communications",
    ],
  ],
  [
    "enumerate-vs-appfolio.md",
    [
      "Reserve balances stay visible for comparison with the board's reserve study",
    ],
  ],
  [
    "hoa-compliance-software.md",
    [
      "Reserve balances stay visible for comparison with the board's reserve study",
    ],
  ],
  [
    "alternatives/caliber-software.md",
    [
      "Reserve balance visibility for comparison with the board's reserve study",
    ],
  ],
  ["best-software-condo-board.md", ["Yes -- state-specific"]],
  ["condocontrol-alternatives.md", ["Yes -- state-specific"]],
  ["hoalife-alternatives.md", ["Yes -- state-specific"]],
  ["payhoa-alternatives.md", ["Yes -- state-specific"]],
]);

const unsupportedGavelhousePatternsByFile = mergeListEntries<RegExp>([
  [
    "hoa-payment-collection-software.md",
    [
      /Gavelhouse[^.\n]*(automates|automatic)[^.\n]*(late notice|reminder)/i,
      /triggers?[^.\n]*late notice workflow/i,
      /applies late fees automatically/i,
      /system handles[^.\n]*automatically/i,
    ],
  ],
  [
    "hoa-self-management-platform.md",
    [
      /Gavelhouse tracks[^.\n]*(state-specific|disclosure|notice deadlines|insurance renewal)/i,
      /Gavelhouse'?s compliance calendar/i,
      /Every function[^.\n]*(violation enforcement|document storage|homeowner communications|compliance tracking)/i,
    ],
  ],
  [
    "hoa-website-builder.md",
    [
      /Gavelhouse'?s community website tools/i,
      /Gavelhouse[^.\n]*(supports public-facing|is an? .*website builder|submit maintenance requests)/i,
    ],
  ],
  [
    "hoa-board-portal.md",
    [
      /Gavelhouse[^.\n]*(submit architectural requests|flag maintenance concerns)/i,
      /Gavelhouse[^.\n]*(document library|maintenance concern)/i,
    ],
  ],
  [
    "alternatives/pilera.md",
    [
      /Gavelhouse[^.\n]*state-specific compliance alerts/i,
      /Gavelhouse[^.\n]*reserve study target tracking/i,
      /Gavelhouse does\./i,
    ],
  ],
  [
    "gavelhouse-vs-quickbooks.md",
    [
      /Reserve Study Integration[\s\S]{0,80}- 'Yes'/i,
      /Percent-Funded Tracking[\s\S]{0,80}- 'Yes'/i,
      /State Compliance Reports[\s\S]{0,120}state-specific/i,
      /tracks balance vs reserve study target/i,
    ],
  ],
  [
    "condocontrol-vs-gavelhouse.md",
    [
      /Reserve percent-funded tracking[\s\S]{0,80}- 'Yes'/i,
      /State-specific compliance[\s\S]{0,80}- 'Yes'/i,
      /reserve compliance dashboard/i,
    ],
  ],
  [
    "hoalife-vs-gavelhouse.md",
    [
      /State reserve compliance tracking[\s\S]{0,80}- 'Yes'/i,
      /Percent-funded tracking[\s\S]{0,40}- 'Yes'\s*$/im,
      /Document storage[\s\S]{0,80}- 'Yes'\s+- 'Yes'/i,
      /Reserve study integration[\s\S]{0,80}- 'Yes'/i,
    ],
  ],
  [
    "managing-hoa-software.md",
    [
      /Gavelhouse tracks delinquencies[^.\n]*sends automated/i,
      /automates the collections workflow/i,
      /prepared when escalation is needed/i,
    ],
  ],
  [
    "lead-magnets/hoa-collections-policy-template.md",
    [
      /automate any part of the collections workflow/i,
      /audit trail of every notice sent/i,
      /escalation action taken/i,
    ],
  ],
  [
    "alternatives/cinc-pro.md",
    [
      /Reserve study targets are tracked against actual balances/i,
      /state-specific alerts/i,
    ],
  ],
  [
    "alternatives/runhoa.md",
    [/dedicated reserve fund compliance\s+tracking/i, /state-specific alerts/i],
  ],
  [
    "runhoa-vs-payhoa.md",
    [
      /reserve fund\s+tracking and state-specific compliance/i,
      /purpose-built compliance tools/i,
    ],
  ],
]);

const supportedGavelhouseClaimsByFile = new Map<string, string[]>([
  [
    "hoa-work-order-software.md",
    [
      "Gavelhouse does not currently ship a work order or vendor management module.",
      "keep the financial side clean",
    ],
  ],
  [
    "hoa-violation-tracking-software.md",
    [
      "Gavelhouse supports manual board-side violation records, current status changes, status history, and photo uploads.",
      "does not currently expose owner-facing event history",
    ],
  ],
  [
    "hoa-website-software.md",
    [
      "current owner portal focuses on dues",
      "violation status should stay in your existing website or storage system until",
    ],
  ],
]);

const unsupportedGavelhouseGlobalPatterns = [
  /Gavelhouse[^.\n]*(reserve study firm integration|integrates? with reserve study firms)/i,
  /Gavelhouse[^.\n]*(balance vs\.? projection tracking|reserve compliance tracking|reserve compliance reporting)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(balance vs\.? projection tracking|reserve compliance tracking|reserve compliance reporting)/i,
  /Gavelhouse[^.\n]*(tracks?|tracking)[^.\n]*reserve[^.\n]*(against|vs\.?)[^.\n]*(reserve study|projection|target)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(tracks?|tracking)[^.\n]*reserve[^.\n]*(against|vs\.?)[^.\n]*(reserve study|projection|target)/i,
  /Gavelhouse[^.\n]*(compliance reporting|compliance reports|state-specific (alerts|compliance|disclosures?))/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(compliance reporting|compliance reports|state-specific (alerts|compliance|disclosures?))/i,
  /Gavelhouse[^.\n]*(funding trajectories|contribution projections|scenario modeling|funding scenarios|underfunding alerts)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(funding trajectories|contribution projections|scenario modeling|funding scenarios|underfunding alerts)/i,
  /Gavelhouse[^.\n]*(live|automatic|monthly|real-time)[^.\n]*percent-funded[^.\n]*(transactions?|updates?)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(live|automatic|monthly|real-time)[^.\n]*percent-funded[^.\n]*(transactions?|updates?)/i,
  /Gavelhouse[^.\n]*(generates?|exports?)[^.\n]*(state-required|state-specific|statutory|certificate|disclosure|compliance)[^.\n]*(report|reports|certificate|disclosure)?/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(generates?|exports?)[^.\n]*(state-required|state-specific|statutory|certificate|disclosure|compliance)[^.\n]*(report|reports|certificate|disclosure)?/i,
  /Gavelhouse[^.\n]*(lender packet|Form 1076|state-specific disclosure|state-specific requirement alerts)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(lender packet|Form 1076|state-specific disclosure|state-specific requirement alerts)/i,
  /Gavelhouse[^.\n]*(timestamped photo evidence|property-referenced photo|photo audit trail|complete evidence file|searchable violation file|exportable violation file)/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*(timestamped photo evidence|property-referenced photo|photo audit trail|complete evidence file|searchable violation file|exportable violation file)/i,
  /Gavelhouse[^.\n]*photos[^.\n]*notices[^.\n]*hearings[^.\n]*fines[^.\n]*one record/i,
  /Gavelhouse[^.\n]*\n\s*[^.\n]*photos[^.\n]*notices[^.\n]*hearings[^.\n]*fines[^.\n]*one record/i,
  /Yes -- (state-specific tracking|jurisdiction-specific rules)/i,
  /- - Percent-funded tracking[\s\S]{0,120}- 'No'\s+- 'No'\s+- 'Yes'/i,
  /- - Document storage[\s\S]{0,120}- 'Yes'\s+- 'Yes'/i,
];

const unsupportedConceptBoundary =
  /(percent-funded|state-required|state-specific|statutory|reserve study|study target|compliance|disclosure|calendar|alert|report|legal|Fannie Mae|threshold|component|projection)/i;

const explicitProductBoundary =
  /\b(does not currently|do not currently|not currently|not shipped|until those modules are shipped|not a substitute)\b/i;

const externalWorkflowBoundary =
  /\b(should remain|should still|should be|should calculate|remain in|external|outside|separately)\b/i;

function isExplicitBoundary(surroundingText: string): boolean {
  return (
    explicitProductBoundary.test(surroundingText) ||
    (unsupportedConceptBoundary.test(surroundingText) &&
      externalWorkflowBoundary.test(surroundingText))
  );
}

describe("Gavelhouse product claims content audit", () => {
  it("does not market unsupported Gavelhouse product workflows as shipped", () => {
    const staleClaims: string[] = [];
    const missingSupportedCopy: string[] = [];

    for (const [filename, snippets] of unsupportedGavelhouseClaimsByFile) {
      const content = readFileSync(findMarketingContentFile(filename), "utf8");
      for (const snippet of snippets) {
        if (content.includes(snippet)) {
          staleClaims.push(`${filename}: ${snippet}`);
        }
      }
    }

    for (const [filename, patterns] of unsupportedGavelhousePatternsByFile) {
      const content = readFileSync(findMarketingContentFile(filename), "utf8");
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          staleClaims.push(`${filename}: ${pattern}`);
        }
      }
    }

    for (const path of collectMarkdownFiles(contentRoot)) {
      const content = readFileSync(path, "utf8");
      for (const pattern of unsupportedGavelhouseGlobalPatterns) {
        for (const match of content.matchAll(new RegExp(pattern, "gi"))) {
          const surroundingText = getSurroundingText(content, match.index ?? 0);
          if (!isExplicitBoundary(surroundingText)) {
            staleClaims.push(
              `${relative(contentRoot, path)}: ${surroundingText.trim()}`,
            );
          }
        }
      }
    }

    for (const [filename, snippets] of supportedGavelhouseClaimsByFile) {
      const content = readFileSync(join(productPagesDir, filename), "utf8");
      for (const snippet of snippets) {
        if (!content.includes(snippet)) {
          missingSupportedCopy.push(`${filename}: ${snippet}`);
        }
      }
    }

    expect({ staleClaims, missingSupportedCopy }).toEqual({
      staleClaims: [],
      missingSupportedCopy: [],
    });
  });

  it("does not overstate shipped Gavelhouse capabilities in hub FAQs", () => {
    const content = readFileSync(
      join(repoRoot, "apps/web/src/config/hub-faqs.ts"),
      "utf8",
    );

    const unsupportedSnippets = [
      "can generate state-required reserve fund disclosures",
      "homeowner communication tools",
      "automatic generation of state-required reserve disclosures",
      "document storage system",
      "Gavelhouse imports reserve study data",
      "generating the disclosures required by state statute",
    ];

    const staleClaims = unsupportedSnippets.filter((snippet) =>
      content.includes(snippet),
    );

    expect(staleClaims).toEqual([]);
  });
});

function findMarketingContentFile(filename: string): string {
  if (filename.includes("/")) {
    return join(repoRoot, "apps/web/src/content", filename);
  }

  const candidateDirs = [
    productPagesDir,
    join(repoRoot, "apps/web/src/content/listicles"),
    join(repoRoot, "apps/web/src/content/guides"),
    join(repoRoot, "apps/web/src/content/comparisons"),
    join(repoRoot, "apps/web/src/content/solutions"),
    join(repoRoot, "apps/web/src/content/lead-magnets"),
    join(repoRoot, "apps/web/src/content/alternatives"),
    join(repoRoot, "apps/web/src/content/pricing-breakdowns"),
    join(repoRoot, "apps/web/src/content/state-pages"),
  ];

  const matches: string[] = [];
  for (const dir of candidateDirs) {
    const path = join(dir, filename);
    try {
      readFileSync(path, "utf8");
      matches.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous marketing content file "${filename}". Use a collection-relative path. Matches: ${matches
        .map((path) => relative(contentRoot, path))
        .join(", ")}`,
    );
  }

  throw new Error(`Missing marketing content file: ${filename}`);
}

function mergeListEntries<T>(entries: [string, T[]][]): Map<string, T[]> {
  const merged = new Map<string, T[]>();

  for (const [filename, values] of entries) {
    merged.set(filename, [...(merged.get(filename) ?? []), ...values]);
  }

  return merged;
}

function collectMarkdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return collectMarkdownFiles(path);
    }

    return entry.endsWith(".md") ? [path] : [];
  });
}

function getSurroundingText(content: string, index: number): string {
  const sentenceStart = Math.max(
    content.lastIndexOf("\n\n", index),
    content.lastIndexOf(".", index),
  );
  const sentenceEndCandidates = [
    content.indexOf("\n\n", index),
    content.indexOf(".", index),
  ].filter((position) => position !== -1);
  const sentenceEnd =
    sentenceEndCandidates.length > 0
      ? Math.min(...sentenceEndCandidates)
      : content.length;

  return content.slice(sentenceStart + 1, sentenceEnd + 1);
}

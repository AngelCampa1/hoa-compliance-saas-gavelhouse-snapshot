import type { FaqItem } from "../lib/types.js";
import {
  TIER_LIMITS,
  TRIAL_DURATION_DAYS,
  TRIAL_ENDING_REMINDER_DAYS,
  getAnnualPricingRangeLabel,
} from "@boardstack/shared";

const annualPricingRange = getAnnualPricingRangeLabel(["starter", "scale"]);
const growthHomeLimit = TIER_LIMITS.growth.homes;

export const hubFaqs: Record<string, FaqItem[]> = {
  "/compare": [
    {
      q: "How is Gavelhouse different from CINC or AppFolio for HOA boards?",
      a: "CINC and AppFolio are built for property managers. Gavelhouse is for one self-managed community. It keeps funds, records, and board work clear.",
    },
    {
      q: "What should HOA boards look for when comparing governance software?",
      a: "Look for reserve tracking, meeting records, and state rule checks. Skip tools built for teams your board does not have.",
    },
    {
      q: "Can volunteer boards actually use HOA software without a property manager?",
      a: "Yes. Pick software made for a board treasurer. It should keep funds, reserves, and records easy to review.",
    },
    {
      q: "What happens after the board starts a trial?",
      a: `Your board gets ${TRIAL_DURATION_DAYS} days to try Gavelhouse. You pick a plan later. We remind you ${TRIAL_ENDING_REMINDER_DAYS} days before the trial ends.`,
    },
  ],
  "/resources": [
    {
      q: "What resources help HOA boards understand reserve fund requirements?",
      a: "Start with the reserve guides. They explain reserve funds, reserve studies, and state rules in plain words.",
    },
    {
      q: "How much time does it take to set up HOA governance software?",
      a: "A self-managed board should be able to configure governance software in an afternoon, importing the community roster, uploading governing documents, and setting up the meeting workflow. If a platform requires a dedicated onboarding session, that's a signal it's built for property managers, not volunteers.",
    },
    {
      q: "Where can I find guides on running effective HOA board meetings?",
      a: "The guides section covers running compliant board meetings, proper notice requirements, quorum rules, voting procedures, and how to produce minutes that hold up if a homeowner challenges a decision. Content is organized by the stage of your meeting cycle, not by platform.",
    },
  ],
  "/compare/alternatives": [
    {
      q: "What are the main HOA management software alternatives for self-managed boards?",
      a: "Volunteer boards usually compare Gavelhouse with products like HOA Express, PayHOA, Vinteum, Buildium, AppFolio, and other HOA software options. The real question is which tools are built for one self-managed community versus professional managers, and which ones keep compliance, reporting, and governance work in the same system.",
    },
    {
      q: "Is QuickBooks a viable option for HOA reserve fund accounting?",
      a: "QuickBooks can handle the bookkeeping but it cannot enforce the separation of operating and reserve funds required by most state HOA statutes. Commingling those funds exposes board members to personal liability. HOA-specific software builds the fund separation into the accounting structure by default.",
    },
    {
      q: "What should I check before switching HOA software platforms?",
      a: "Confirm the new platform can import your homeowner directory, payment history, and governing documents. Ask about reserve fund balance migration specifically, that data needs to carry over accurately or you'll be starting your compliance records from scratch.",
    },
  ],
  "/compare/versus": [
    {
      q: "What features matter most when comparing HOA governance platforms?",
      a: "For a self-managed board, the short list is: reserve fund tracking with fund separation, meeting records, owner payment access, architectural request visibility, and state compliance checklists. Features like amenity booking, mass communications, and maintenance ticketing are secondary for boards that don't manage facilities directly.",
    },
    {
      q: "How does HOA software pricing compare across platforms?",
      a: `Most HOA platforms charge per unit or per community. Gavelhouse charges flat rates by community size (${annualPricingRange}) so a 150-unit community pays the same each month regardless of how many homeowners contact the board. Per-unit pricing compounds as communities grow.`,
    },
    {
      q: "Do these comparisons reflect current platform pricing?",
      a: "Each comparison is updated when a platform changes its pricing or feature structure, with a last-updated date shown on the page. HOA software pricing changes less frequently than general SaaS, but always verify directly with vendors before making a purchase decision.",
    },
  ],
  "/compare/pricing": [
    {
      q: "Why do HOA software vendors make pricing so hard to find?",
      a: "Enterprise-focused platforms prefer custom quotes so they can price based on portfolio size and negotiated volume. For a volunteer board managing one community, this means sitting through a demo to get a number. These pricing breakdowns surface actual published rates and flag where per-unit or setup fees change the total cost.",
    },
    {
      q: "What hidden fees show up in HOA management software pricing?",
      a: "Watch for per-homeowner fees that scale with community size, payment processing fees layered on top of subscription costs, setup and data migration fees, and feature gating where state compliance tools require the enterprise tier. Some platforms also charge separately for reserve fund tracking.",
    },
    {
      q: "How does Gavelhouse's pricing compare to alternatives for a 100-unit HOA?",
      a: `Gavelhouse's Growth plan is flat-rate for communities up to ${growthHomeLimit} units. Per-unit platforms at market rates typically run $0.50-$1.50 per unit per month, putting a 100-unit HOA at $50-$150/month before setup fees. The comparison pages break down specific platform pricing for communities of that size.`,
    },
  ],
  "/resources/best": [
    {
      q: "How are 'best HOA software' roundups put together on this site?",
      a: "Each roundup evaluates platforms against the needs of self-managed volunteer boards, state compliance features, reserve fund separation, meeting management, and pricing structure. We don't take placement fees and update rankings when platform features or pricing change materially.",
    },
    {
      q: "Are these software lists useful for a board with no prior software experience?",
      a: "Yes. Each roundup specifies the target community type and board experience level. A first-time board treasurer and a veteran HOA president have different needs; the roundups flag which platforms are easier to start with and which offer more depth for complex communities.",
    },
    {
      q: "What's the difference between HOA management software and property management software?",
      a: "Property management software is built for professional managers running many communities as a business. HOA management software focuses on the governance side, meetings, votes, compliance, and reserve tracking, for the board itself. Boards using property management software typically pay for features they'll never need.",
    },
  ],
  "/resources/guides": [
    {
      q: "What guides help a new HOA board treasurer get up to speed?",
      a: "The guides section covers reserve fund accounting basics, how to read a reserve study report, state-specific disclosure requirements, and how to choose software that helps organize the records boards use for compliance review. The content is written for volunteer treasurers, not CPAs.",
    },
    {
      q: "Are there guides on protecting board members from personal liability?",
      a: "Yes. Several guides cover the specific ways HOA board members face personal liability, primarily reserve fund mismanagement and failure to follow state meeting notice requirements. Each guide identifies where software can make compliance steps easier to document and review.",
    },
    {
      q: "Where do I find guidance on switching HOA platforms mid-year?",
      a: "The guides section includes a platform migration guide covering the steps to transfer your homeowner roster, financial records, and governing documents without losing your audit trail. Timing a switch to align with your fiscal year start reduces the accounting complexity.",
    },
  ],
  "/hoa-compliance": [
    {
      q: "Do HOA compliance rules differ by state for reserve fund requirements?",
      a: "Yes, significantly. States like California, Florida, and Virginia have specific statutes requiring reserve studies, minimum funding levels, and annual disclosures to homeowners. Other states leave reserve fund decisions to the board's discretion. Software that builds state-specific rules into the compliance checklist reduces the risk of missing a statutory requirement.",
    },
    {
      q: "What software features help a board stay audit-ready for state compliance?",
      a: "Key features are: fund separation that prevents commingling operating and reserve accounts, reserve tracking that makes disclosure work easier to review, meeting records that preserve board decisions, and a records process for documents homeowners can request by law. Gavelhouse does not currently ship automatic state disclosure generation or a full document library.",
    },
    {
      q: "How does HOA compliance software handle states with mandatory reserve studies?",
      a: "In states with mandatory reserve studies (California, Nevada, Florida), boards need to track funding against the reserve study recommendations and disclose the funding percentage annually. Gavelhouse tracks reserve balances, reserve budget allocation, and reporting context; boards should still prepare statute-specific disclosure language with their CPA or counsel today.",
    },
    {
      q: "What liability exposure do board members face when compliance software isn't used?",
      a: "The primary exposure is personal liability for reserve fund mismanagement, specifically commingling funds or failing to disclose reserve status. Most state HOA statutes protect board members who follow proper procedures, and software that enforces those procedures provides a documented compliance trail if a homeowner files a complaint.",
    },
  ],
};

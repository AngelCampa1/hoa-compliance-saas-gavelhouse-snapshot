import {
  getDiscountedDisplayPrice,
  getTierHomeRangeLabel,
  knowledgeBase,
  type LeadMagnetSlug,
} from "@boardstack/shared";

export type NurtureStep = {
  dayOffset: 2 | 5 | 9 | 14;
  subject: string;
  preheader: string;
  heading: string;
  bodyMarkdown: string;
  ctaLabel: string;
  ctaUrl: string;
};

export type MagnetEmailConfig = {
  slug: LeadMagnetSlug;
  title: string;
  personaTag: string;
  deliverySubject: string;
  deliveryPreheader: string;
  deliveryBodyMarkdown: string;
  steps: [NurtureStep, NurtureStep, NurtureStep, NurtureStep];
};

const DISALLOWED_CTA_PATH_PREFIXES = [
  "/guides/",
  "/lead-magnets/",
  "/features/",
  new URL(knowledgeBase.marketing.funnel.publicSignupUrl).pathname,
] as const;

const marketingKnowledge = knowledgeBase.marketing;
const offerCode = marketingKnowledge.offer.code;
const offerLabel = marketingKnowledge.offer.label;
const guaranteeLabel = marketingKnowledge.offer.guaranteeLabel;
const canonicalMarketingOrigin = `https://${marketingKnowledge.product.domain}`;
const canonicalMarketingUrl = (pathname: string): string =>
  new URL(pathname, canonicalMarketingOrigin).toString();
const canonicalPricingUrl = canonicalMarketingUrl("/pricing/");
const trialDurationLabel = `${marketingKnowledge.offer.guaranteeDays}-day`;
const startWithOffer = `Start with ${offerCode}`;
const offerPreheader = `Flat pricing, no per-unit fees, ${offerCode} limited offer and ${guaranteeLabel}.`;
const starterDiscount = getDiscountedDisplayPrice("starter", "monthly");
const growthDiscount = getDiscountedDisplayPrice("growth", "monthly");
const scaleDiscount = getDiscountedDisplayPrice("scale", "monthly");
const standardOfferBody = `Pricing is flat with ${offerCode}: **${starterDiscount} Starter** (${getTierHomeRangeLabel("starter")}), ${growthDiscount} Growth (${getTierHomeRangeLabel("growth")}), ${scaleDiscount} Scale (${getTierHomeRangeLabel("scale")}). No per-unit fees. That is ${offerLabel}. ${guaranteeLabel}.`;
const portfolioOfferBody = `Pricing is flat with ${offerCode}: **${starterDiscount} Starter** (${getTierHomeRangeLabel("starter")}), ${growthDiscount} Growth (${getTierHomeRangeLabel("growth")}), ${scaleDiscount} Scale (${getTierHomeRangeLabel("scale")}). Portfolio is custom for larger or multi-community operators. No per-unit fees at any self-serve tier. ${guaranteeLabel}.`;

const reserveFundCalculator: MagnetEmailConfig = {
  slug: "reserve-fund-calculator",
  title: "Reserve Fund Calculator",
  personaTag: "Treasurer",
  deliverySubject: "Your Reserve Fund Calculator is ready",
  deliveryPreheader:
    "Calculate your percent-funded ratio in under five minutes.",
  deliveryBodyMarkdown: [
    "Your **Reserve Fund Calculator** is attached below. It takes your current reserve balance, your reserve study's fully funded target, and returns your percent-funded ratio -- the single number Fannie Mae, Freddie Mac, and most lenders use to judge whether your community is solvent on paper.",
    "Open the first tab, drop in your balance and target, and look at the result. Anything under 70% is where secondary-market lenders start flagging your association. Under 30% is where boards start facing personal exposure questions.",
    "We built Gavelhouse because spreadsheets like this are the last mile before real compliance breaks down. Use this first -- then we can talk about the system behind it.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The one reserve number boards misread most",
      preheader:
        "Percent-funded is not the same as 'we have money in the bank'.",
      heading: "Percent-funded is not cash-on-hand",
      bodyMarkdown: [
        "Quick tactical note on the calculator we sent: the most common mistake boards make is confusing **reserve balance** with **percent-funded**. A community can have $180,000 sitting in a reserve account and still be at 22% funded if the study says they should have $800,000 by now.",
        "Lenders do not care about the absolute balance. They care about the ratio against the study's fully funded target at this point in the component life cycle. That is the number you report on Fannie Mae Form 1076.",
        "Rerun the calculator with your study's current-year target, not the ultimate replacement cost. If the gap is wide, flag it in your next board packet before a unit owner's lender does.",
      ].join("\n\n"),
      ctaLabel: "Read the reserve compliance guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-reserve-fund-compliance-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the 50-state reserve requirements reference",
      preheader:
        "Your state may already require a reserve study on a fixed schedule.",
      heading: "State reserve requirements you may not know apply to you",
      bodyMarkdown: [
        "Most boards treat the reserve study as a best practice. In many states it is statute, not best practice. California's Civil Code 5550 requires a reserve study every three years. Florida's 718.112 requires a structural reserve study every ten years for buildings three stories or taller. Washington, Oregon, Nevada, Hawaii, and others have their own mandates.",
        "We built a companion reference -- the **50-State Reserve Fund Requirements** one-pager -- that lists what each state requires and how often. If you have not checked your state's rule in the last twelve months, pull the reference now.",
        "A missed statutory deadline is a fiduciary finding that attaches to individual directors, not just the association.",
      ].join("\n\n"),
      ctaLabel: "Get the 50-state reference",
      ctaUrl: canonicalMarketingUrl(
        "/free/50-state-reserve-fund-requirements/",
      ),
    },
    {
      dayOffset: 9,
      subject: "Personal liability when reserves are commingled",
      preheader:
        "QuickBooks cannot separate operating and reserve funds. Your state probably requires it.",
      heading:
        "Commingling operating and reserve funds is a personal liability issue",
      bodyMarkdown: [
        "Most volunteer treasurers run the books in QuickBooks or a spreadsheet. Neither tool enforces the separation of operating and reserve funds. The result is what auditors call **commingling** -- and in most states, commingling reserves is a direct breach of the board's fiduciary duty.",
        "If a reserve transfer is reclassified as an operating expense, or an operating shortfall is covered from reserves without a documented loan and repayment plan, individual directors can be named. D&O insurance will often decline a claim tied to a documented breach of duty.",
        "We built Gavelhouse because we watched this pattern repeat. The database enforces fund separation at the schema layer -- you cannot post a reserve expense to an operating account by accident.",
      ].join("\n\n"),
      ctaLabel: "See how fund separation works",
      ctaUrl: canonicalMarketingUrl("/product/hoa-fund-accounting-software/"),
    },
    {
      dayOffset: 14,
      subject: "Ready to move off the spreadsheet?",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The calculator is useful for one-off checks. It will not help you the next time a unit owner's lender asks for a completed Fannie Mae Form 1076 in 48 hours, or when your auditor asks for a reserve transfer trail.",
        "Gavelhouse replaces the spreadsheet. Percent-funded is computed live from the ledger. Reserve transfers are recorded with a clear audit trail. State-specific disclosures are generated from your books, not retyped from memory.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const annualMeetingPlanner: MagnetEmailConfig = {
  slug: "hoa-annual-meeting-planner",
  title: "HOA Annual Meeting Planner",
  personaTag: "Secretary",
  deliverySubject: "Your HOA Annual Meeting Planner is ready",
  deliveryPreheader:
    "Notice deadlines, quorum math, and a minutes template in one file.",
  deliveryBodyMarkdown: [
    "Your **HOA Annual Meeting Planner** is attached. It covers the three things most boards underprepare for: notice deadlines, quorum math, and minutes that hold up in litigation.",
    "Start with the notice section. Most state statutes and most CC&Rs require notice somewhere between 10 and 60 days before the meeting, delivered by a specific method. Missing that window is the single most common reason board actions get later invalidated.",
    "We built Gavelhouse because secretaries on volunteer boards should not have to memorize notice rules by state. Use the planner today -- then we will show you how Gavelhouse automates the parts that should never depend on one person's calendar.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The quorum number your CC&Rs probably override",
      preheader:
        "State default is often 25%. Your governing documents may say something different.",
      heading: "Always check CC&Rs before defaulting to state quorum",
      bodyMarkdown: [
        "Quick follow-up on the planner: the most common mistake is assuming the state's default quorum applies. In most states the default for annual meetings is 25 to 30 percent of voting interests. Almost every set of CC&Rs we have read overrides that number -- sometimes up, usually down.",
        "Before you publish notice for the annual meeting, pull the original CC&Rs plus every recorded amendment and confirm the **quorum clause for owner meetings** specifically. Quorum for the annual meeting is often different from quorum for a special assessment vote.",
        "If you cannot prove quorum in the minutes, the actions taken at the meeting are voidable. That matters two years later when someone challenges a budget vote.",
      ].join("\n\n"),
      ctaLabel: "Read the annual meeting compliance guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-meeting-minutes-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the board transition checklist",
      preheader:
        "If new directors are elected at the annual meeting, transition starts that night.",
      heading: "Plan the handover before the vote, not after",
      bodyMarkdown: [
        "The annual meeting is usually when new directors are seated. The night they are elected is the night the outgoing board's document custody becomes a liability question. Keys, bank signers, vendor logins, insurance certificates, and the minute book all have to change hands on a timeline.",
        "We built a companion resource -- the **HOA Board Transition Checklist** -- that lines up the handover tasks by priority. Banking and insurance on day one. Vendor contracts and statutory filings within two weeks. Historical records by month-end.",
        "Pull the checklist before the annual meeting so the outgoing secretary can stage the handover rather than scramble.",
      ].join("\n\n"),
      ctaLabel: "Get the transition checklist",
      ctaUrl: canonicalMarketingUrl("/free/hoa-board-transition-checklist/"),
    },
    {
      dayOffset: 9,
      subject: "Minutes are a legal record, not a courtesy",
      preheader:
        "State law treats meeting minutes as the official record of board action.",
      heading: "What your state actually requires in the minutes",
      bodyMarkdown: [
        "Most states treat meeting minutes as the official legal record of the association's actions. California Civil Code 4950, Florida Statute 720.303, Texas Property Code 209.005 -- every one requires minutes be kept, retained for a statutory period, and made available to members on request.",
        "The personal liability angle: if a director votes against a resolution, it only protects them if the dissenting vote is **recorded in the minutes**. A verbal objection that never makes it to paper is treated the same as an affirmative vote for fiduciary purposes.",
        "QuickBooks does not store minutes. A shared Google Doc is not a retention system. We built Gavelhouse because the minute book is a legal document and deserves to be treated like one.",
      ].join("\n\n"),
      ctaLabel: "See governance document retention",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-secretary-software/"),
    },
    {
      dayOffset: 14,
      subject: "Run the next annual meeting from one system",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The planner helps you run one meeting. Gavelhouse helps you run every meeting: notice generated from the state rule, ballots tied to recorded owners, quorum counted live, minutes stored with retention timers, vote records attached to the resolution they authorized.",
        "For a volunteer secretary who inherited the role with a month of warning, that is the difference between improvising and running a defensible meeting.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const evaluationScorecard: MagnetEmailConfig = {
  slug: "hoa-software-evaluation-scorecard",
  title: "HOA Software Evaluation Scorecard",
  personaTag: "Board member evaluating tools",
  deliverySubject: "Your HOA Software Evaluation Scorecard is ready",
  deliveryPreheader:
    "Compare tools on the criteria that actually affect board liability.",
  deliveryBodyMarkdown: [
    "Your **HOA Software Evaluation Scorecard** is attached. It is a side-by-side grid across the criteria that actually matter for a self-managed board: fund separation, reserve reporting, state-specific compliance outputs, audit trail quality, pricing model, and exit rights.",
    "Start with the fund separation row. Any tool that treats reserves as a memo tag on an operating ledger fails the first test. The second row is pricing: per-unit fees compound against you as the community grows. Flat pricing by size band does not.",
    "We built Gavelhouse because we kept hearing the same evaluation story from volunteer boards -- tools demoed well and then failed the first audit. Use the scorecard on every vendor, including us.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The evaluation question vendors hate",
      preheader: "'Show me how a reserve transfer is recorded end to end.'",
      heading: "One question that separates real accounting from bolt-ons",
      bodyMarkdown: [
        "Tactical tip on using the scorecard: the single most useful demo question is **'walk me through a reserve transfer from initiation to audit trail'**. Ask to see the journal entries on both sides, the approval record, and how it will appear on the next balance sheet.",
        "If the answer is a category toggle on a single transaction line, the tool is not doing real fund accounting -- it is labeling an operating entry. That breaks the moment an auditor or a state examiner asks for a separated balance sheet.",
        "Score every vendor on this row honestly. It is more predictive of long-term fit than onboarding speed or UI polish.",
      ].join("\n\n"),
      ctaLabel: "Read the evaluation framework",
      ctaUrl: canonicalMarketingUrl("/free/hoa-software-evaluation-scorecard/"),
    },
    {
      dayOffset: 5,
      subject: "Companion: the reserve compliance checklist",
      preheader:
        "Use it on every tool you evaluate, including the one you already own.",
      heading: "What compliance outputs to require before signing",
      bodyMarkdown: [
        "The scorecard tells you what to score. The **Reserve Compliance Checklist** tells you what each scored capability should actually produce on paper. Fannie Mae Form 1076 support. A reserve transfer register. A percent-funded history by period. State-specific disclosures.",
        "Before you sign any contract -- with any vendor -- require a live export of each of those artifacts from a sample community. If the vendor will not do that demo, the feature is probably on a roadmap slide, not in the product.",
        "We publish Gavelhouse's exports as sample PDFs on the marketing site for exactly this reason.",
      ].join("\n\n"),
      ctaLabel: "Get the reserve compliance checklist",
      ctaUrl: canonicalMarketingUrl("/free/reserve-compliance-checklist/"),
    },
    {
      dayOffset: 9,
      subject: "Why QuickBooks fails the scorecard",
      preheader:
        "General-purpose accounting and HOA fund accounting are not the same discipline.",
      heading: "QuickBooks is a general ledger, not a fund accounting system",
      bodyMarkdown: [
        "Most self-managed boards land on QuickBooks because the treasurer already knows it. It fails the evaluation scorecard on the same rows every time: **fund separation is a class tag, not a schema constraint**; reserve reporting requires manual journal entries the next treasurer will not know to repeat; state-specific disclosures do not exist.",
        "The result is commingled books that look fine until an auditor, a lender, or an adverse owner asks for a real reserve-versus-operating split. At that point, the gap surfaces in a month the board did not plan for.",
        "We built Gavelhouse because a volunteer treasurer should not have to build a fund accounting layer on top of QuickBooks by hand. The separation is enforced in the database.",
      ].join("\n\n"),
      ctaLabel: "See the anti-QuickBooks case",
      ctaUrl: canonicalMarketingUrl("/compare/quickbooks"),
    },
    {
      dayOffset: 14,
      subject: "Score Gavelhouse against your shortlist",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        `The scorecard only works if you actually run a tool long enough to score it honestly. That is why our trial is ${trialDurationLabel}, not 14 days -- one full billing cycle for a small community, enough to exercise fund separation, reserve reporting, and at least one month-end close.`,
        "you can export everything out at any point -- your data is yours.",
        portfolioOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const boardTransitionChecklist: MagnetEmailConfig = {
  slug: "hoa-board-transition-checklist",
  title: "HOA Board Transition Checklist",
  personaTag: "Incoming board member",
  deliverySubject: "Your HOA Board Transition Checklist is ready",
  deliveryPreheader:
    "Banking, insurance, documents, and statutory filings -- prioritized.",
  deliveryBodyMarkdown: [
    "Your **HOA Board Transition Checklist** is attached. It orders the handover tasks by risk: banking signers and insurance named insureds first, vendor contracts and statutory filings within two weeks, historical records and minute books by month-end.",
    "Start with the banking row today. Until the new treasurer is on the signature card, the outgoing treasurer still has legal authority over the operating and reserve accounts. That window is where most documented handover disputes originate.",
    "We built Gavelhouse because document custody should not depend on whether the outgoing secretary remembered to hand over a USB drive. Use the checklist first -- then we will show you how a system of record changes the transition entirely.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The one email to send the insurance agent",
      preheader:
        "D&O coverage protects 'directors', not 'the people who were directors last year'.",
      heading: "Update the D&O insurance named insureds this week",
      bodyMarkdown: [
        "Tactical note from the checklist: directors-and-officers coverage typically runs on a claims-made basis. If a claim arises next year about an action the board took this year, the policy in force at the time of the claim is what responds -- and it only covers **the named insureds on that policy**.",
        "Outgoing directors should stay listed for the statute of limitations window on their actions. Incoming directors should be added before their first board vote. Most agents will do this as a free endorsement, but only if you ask.",
        "Send the email the week you are seated. Do not wait for the next renewal cycle.",
      ].join("\n\n"),
      ctaLabel: "Read the D&O coverage guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-board-liability-protection-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the annual meeting planner",
      preheader:
        "The next annual meeting is the first test of the new board's governance.",
      heading: "Plan the first meeting on the new board's terms",
      bodyMarkdown: [
        "The board that inherited a messy handover usually inherits a messy first annual meeting. Notice deadlines slip, the minute book is incomplete, and quorum becomes a fight instead of an administrative check.",
        "The **HOA Annual Meeting Planner** is the companion resource. It gives the new secretary a timeline to work backwards from: notice published by a specific date, ballots mailed, quorum tallied, minutes filed to the retention standard your state requires.",
        "Pull it while you are still in transition mode -- the work compounds if you leave it for the agenda two weeks before the meeting.",
      ].join("\n\n"),
      ctaLabel: "Get the annual meeting planner",
      ctaUrl: canonicalMarketingUrl("/free/hoa-annual-meeting-planner/"),
    },
    {
      dayOffset: 9,
      subject: "The documents the outgoing board legally owes you",
      preheader:
        "State statutes list the records that must transfer on transition. Know the list.",
      heading: "Records the outgoing board must legally turn over",
      bodyMarkdown: [
        "Most state HOA statutes (California's Davis-Stirling Act, Florida 720.303, Texas 209.005, and parallels in other states) enumerate the records associations must keep and turn over on request. Governing documents, meeting minutes, membership rolls, financial records typically for seven years, reserve studies, insurance policies, contracts, tax filings.",
        "The personal liability angle: if the outgoing board cannot produce a statutorily required record, the incoming board inherits the gap -- and the **next** lender request, audit, or owner dispute surfaces it.",
        "We built Gavelhouse because documents should live in a system, not on a departing treasurer's hard drive. Retention is enforced at the system layer.",
      ].join("\n\n"),
      ctaLabel: "See document retention in Gavelhouse",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-secretary-software/"),
    },
    {
      dayOffset: 14,
      subject: "Start the new term on a real system of record",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist gets you through the first month. A system of record gets you through the rest of the term. Gavelhouse holds the ledger, the minute book, reserve transfers, vendor contracts, insurance renewals, and statutory filings in one place -- with an audit trail the next incoming board will actually be able to read.",
        "For a new board that just inherited a box of paper and three shared Google Drives, that is the difference between running the association and reconstructing it.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const budgetTemplate: MagnetEmailConfig = {
  slug: "hoa-budget-template",
  title: "HOA Budget Template",
  personaTag: "Treasurer",
  deliverySubject: "Your HOA Budget Template is ready",
  deliveryPreheader:
    "Operating and reserve budgets, separated -- not commingled.",
  deliveryBodyMarkdown: [
    "Your **HOA Budget Template** is attached. Unlike a generic small-business budget, this template forces the separation that your CC&Rs and most state statutes already require: operating income and expenses on one sheet, reserve contributions and planned reserve expenditures on a second.",
    "Start with the reserve contribution line. Compare the amount you are budgeting to the annual contribution your reserve study recommends. If those numbers do not match within a few hundred dollars, fix it this year -- not after the next deferred maintenance surprise.",
    "We built Gavelhouse because the typical HOA budget is built in a single commingled spreadsheet that quietly hides under-funding. Use the template -- then we will show you why the separation needs to be enforced, not optional.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The reserve contribution number that hides the problem",
      preheader: "'Budgeted' is not the same as 'what the reserve study says'.",
      heading: "Budget the reserve study's number, not last year's plus 3%",
      bodyMarkdown: [
        "Tactical follow-up on the budget template: the single most common budgeting mistake is setting next year's reserve contribution at **last year's contribution plus CPI** instead of at **the amount the reserve study recommends**.",
        "The study already accounts for inflation and component life. Under-funding to match last year's comfortable number is how communities arrive at the ten-year mark with a $400,000 roof bill and $120,000 in reserves.",
        "Open the template, paste in the study's recommended annual contribution, and let the operating side absorb the variance. If dues need to increase to match, that is the fiduciary answer -- and it is easier to defend at one annual meeting than during an emergency special assessment later.",
      ].join("\n\n"),
      ctaLabel: "Read the reserve contribution guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-reserve-fund-compliance-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the reserve fund calculator",
      preheader:
        "Use the calculator to check the budget before it goes to the board.",
      heading: "Validate the budget against percent-funded math",
      bodyMarkdown: [
        "The template organizes the numbers. The **Reserve Fund Calculator** validates them. Once the budget is drafted, plug the projected year-end reserve balance into the calculator and check the percent-funded trajectory.",
        "If the budget keeps percent-funded flat, you are treading water against a study that already assumes improvement. If it drops percent-funded, the budget is silently under-funding the reserve regardless of what the line item says.",
        "Running both documents together before the budget goes to the board is how treasurers catch the gap before a unit owner's lender does.",
      ].join("\n\n"),
      ctaLabel: "Get the reserve fund calculator",
      ctaUrl: canonicalMarketingUrl("/free/reserve-fund-calculator/"),
    },
    {
      dayOffset: 9,
      subject: "Why one spreadsheet is a compliance problem",
      preheader:
        "QuickBooks and commingled spreadsheets hide the separation your state requires.",
      heading:
        "One spreadsheet, two funds, one audit finding waiting to happen",
      bodyMarkdown: [
        "A single-sheet budget with a reserve 'line item' looks organized but fails the compliance test: there is no enforced separation between operating and reserve funds. The next time a reserve expense gets paid out of operating because that is where the cash is, nothing in the spreadsheet stops it.",
        "In most states, **commingling operating and reserve funds is a breach of fiduciary duty**, full stop. QuickBooks does not fix this -- a class tag on a journal entry is not fund accounting.",
        "We built Gavelhouse because the separation needs to be enforced at the schema layer. You cannot post a reserve expense to the operating fund by accident, because the database will not let you.",
      ].join("\n\n"),
      ctaLabel: "See how fund separation is enforced",
      ctaUrl: canonicalMarketingUrl("/product/hoa-fund-accounting-software/"),
    },
    {
      dayOffset: 14,
      subject: "Move the budget into a real system",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The template will get you through budget season. A real system is what keeps the budget honest the other eleven months. In Gavelhouse, the budget lives next to the actuals, variances are calculated live, and fund separation is structural -- not a formatting convention in a spreadsheet.",
        "For a volunteer treasurer inheriting a set of books from someone who never separated the funds, the first Gavelhouse onboarding step is to get the current reality into the right accounts. From there, the budget lines up against reality instead of against itself.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const reserveComplianceChecklist: MagnetEmailConfig = {
  slug: "reserve-compliance-checklist",
  title: "Reserve Compliance Checklist",
  personaTag: "Treasurer / Compliance officer",
  deliverySubject: "Your Reserve Compliance Checklist is ready",
  deliveryPreheader:
    "Every reserve compliance artifact your state or lender will ask for.",
  deliveryBodyMarkdown: [
    "Your **Reserve Compliance Checklist** is attached. It enumerates the artifacts most boards discover they need only when a lender or auditor asks: a current reserve study, a percent-funded computation, a reserve transfer register, Fannie Mae Form 1076 inputs, and the state-specific disclosures that apply to you.",
    "Start at the top of the list. If any row is 'not sure' or 'last done in 2019', you have a gap that will surface on someone else's timeline. Fix the oldest row first.",
    "We built Gavelhouse because volunteer boards should not be asked to assemble this packet under pressure. Use the checklist -- then we can show you the version of these artifacts that generates from your books instead of from memory.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The document most boards cannot produce in 48 hours",
      preheader:
        "Fannie Mae Form 1076 asks for reserve detail most associations do not pre-compute.",
      heading: "Fannie Mae Form 1076 turnaround is a compliance stress test",
      bodyMarkdown: [
        "Tactical tip from the checklist: the most common last-minute compliance scramble is **Fannie Mae Form 1076**, the Condominium Project Questionnaire. A unit owner's lender asks for it, and the board has 48 to 72 hours to return it complete.",
        "The section that breaks most boards is the reserve detail: current reserve balance, annual reserve contribution as a percent of budget, and confirmation that reserves are segregated from operating funds. If the books are commingled, there is no honest way to answer the segregation question.",
        "Pre-computing these fields now -- not the day the request lands -- is the difference between a routine answer and an ad hoc governance scramble.",
      ].join("\n\n"),
      ctaLabel: "Read the Form 1076 preparation guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/condo-questionnaire-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the 50-state reserve requirements reference",
      preheader:
        "State-specific rules sit on top of the federal lender questionnaire.",
      heading:
        "Your state's reserve rules stack on top of federal requirements",
      bodyMarkdown: [
        "The checklist covers the federal and lender side. The **50-State Reserve Fund Requirements** one-pager covers the state-law side -- which for many communities is the stricter of the two.",
        "California's Civil Code 5550 mandates reserve studies every three years. Florida 718.112 requires structural reserve studies on a ten-year cycle for buildings three stories or taller. Washington, Oregon, Hawaii, Nevada, and others have their own cadences and disclosures.",
        "Pull the reference alongside the checklist. The combined view tells you what compliance actually looks like for **your** community, not for a generic HOA template.",
      ].join("\n\n"),
      ctaLabel: "Get the 50-state reserve reference",
      ctaUrl: canonicalMarketingUrl(
        "/free/50-state-reserve-fund-requirements/",
      ),
    },
    {
      dayOffset: 9,
      subject: "Where individual directors become personally exposed",
      preheader:
        "Known compliance gaps that go unaddressed shift the liability question.",
      heading: "A documented gap is harder to defend than an unknown one",
      bodyMarkdown: [
        "The personal liability angle the checklist surfaces: once a director is on notice of a compliance gap -- a missed reserve study, commingled funds, a required disclosure never filed -- the fiduciary calculus changes. **Ignorance is a much stronger defense than documented awareness and no action.**",
        "This is why the checklist matters beyond the paperwork. Running it creates the record that the board identified the gaps. Closing the gaps creates the record that the board discharged its duty. Leaving gaps open after the checklist creates the record that cuts the other way.",
        "We built Gavelhouse because the remediation side of this -- actually closing gaps -- should not depend on a spreadsheet passed down between treasurers.",
      ].join("\n\n"),
      ctaLabel: "See compliance gap remediation",
      ctaUrl: canonicalMarketingUrl(
        "/product/hoa-reserve-fund-compliance-software/",
      ),
    },
    {
      dayOffset: 14,
      subject: "Generate the compliance packet from the books",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist tells you what you need. Gavelhouse produces it from the ledger on demand: percent-funded, reserve transfer register, Fannie Mae Form 1076 inputs, state-specific disclosures. When a lender asks for the packet on a Friday afternoon, it is a one-click export -- not a weekend.",
        "That is the whole reason Gavelhouse exists. Compliance artifacts should fall out of the accounting, not be reconstructed alongside it.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const fiftyStateReserveReference: MagnetEmailConfig = {
  slug: "50-state-reserve-fund-requirements",
  title: "50-State Reserve Fund Requirements",
  personaTag: "Treasurer / Legal reference",
  deliverySubject: "Your 50-State Reserve Fund Requirements reference is ready",
  deliveryPreheader:
    "State-by-state reserve study, disclosure, and funding rules in one file.",
  deliveryBodyMarkdown: [
    "Your **50-State Reserve Fund Requirements** reference is attached. It lists, for each state, the statutory reserve study cadence, reserve funding rule, disclosure requirement, and citation so you can verify against the primary source.",
    "Start with your own state. If the row says 'every three years' or 'every ten years for buildings of X stories', pull your last reserve study and confirm the date. If the study is older than the statutory cadence, that gap is the first compliance issue to close.",
    "We built Gavelhouse because state rules change and volunteer boards should not be asked to track them by hand. Use the reference as a starting point -- then we will show you how state-specific obligations become part of the system.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The row that surprises most out-of-state owners",
      preheader:
        "Rules apply based on where the property is, not where the board lives.",
      heading: "Statutes follow the property, not the board",
      bodyMarkdown: [
        "Tactical tip on the reference: reserve statutes apply based on the **state the property is in**, not the state the board members live in. A non-resident treasurer managing a Florida condo is bound by Florida 718, regardless of where they sign the books.",
        "This matters for multi-community boards and for HOAs that formed under one state's law but have members scattered across others. The reserve study cadence, the disclosure format, the funding rule -- all governed by the property's state.",
        "Check your state's row now. Then check the row for any community you serve on the board of. The answers are not always the same.",
      ].join("\n\n"),
      ctaLabel: "Read the state compliance overview",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/post-surfside-hoa-legislation-tracker/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the reserve compliance checklist",
      preheader:
        "The reference tells you the rule. The checklist tells you the proof.",
      heading: "Pair the reference with the compliance checklist",
      bodyMarkdown: [
        "The state reference answers the question 'what does the law require?'. The **Reserve Compliance Checklist** answers the follow-up: 'what document proves I did it?'. A current reserve study for the statutory period. A percent-funded computation. A disclosure filed with the annual meeting notice.",
        "The two work together. Rule on one side, evidence on the other. If any state requirement on the reference does not have a corresponding artifact in the checklist, that is a gap to close.",
        "This pairing is the minimum viable compliance file for a self-managed board.",
      ].join("\n\n"),
      ctaLabel: "Get the reserve compliance checklist",
      ctaUrl: canonicalMarketingUrl("/free/reserve-compliance-checklist/"),
    },
    {
      dayOffset: 9,
      subject: "State statutes and director personal liability",
      preheader:
        "Many state statutes create direct personal exposure for specific breaches.",
      heading: "Specific statutes attach liability to individual directors",
      bodyMarkdown: [
        "Several state HOA and condo statutes go beyond general fiduciary duty and attach specific obligations directly to directors: Florida 720.3033 requires director certifications within a fixed window of election; California's Davis-Stirling imposes member record access obligations with stated remedies; Texas 209 enumerates director access and handover duties.",
        "The personal liability angle is that these obligations sit on **the director personally**, not just on the association as an entity. A missed statutory certification is not cured by pointing to a busy year.",
        "We built Gavelhouse because tracking these director-level obligations by hand is how volunteer boards end up in avoidable trouble. The system keeps the calendar.",
      ].join("\n\n"),
      ctaLabel: "See director obligation tracking",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-president-software/"),
    },
    {
      dayOffset: 14,
      subject: "Make state compliance part of the system, not the memory",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "A reference PDF will not remind you when the next reserve study is due. Gavelhouse will. The state rule table is wired into the account, which means statutory cadence, disclosure deadlines, and director certification windows come up as calendar items against your community's actual facts.",
        "That is the point of moving off paper references: the state rule stops being something the treasurer has to remember.",
        portfolioOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const boardMeetingAgendaTemplate: MagnetEmailConfig = {
  slug: "hoa-board-meeting-agenda-template",
  title: "HOA Board Meeting Agenda Template",
  personaTag: "Board president / Secretary",
  deliverySubject: "Your HOA Board Meeting Agenda Template is ready",
  deliveryPreheader:
    "Quorum, financial reports, reserve updates, and executive session structure.",
  deliveryBodyMarkdown: [
    "Your **HOA Board Meeting Agenda Template** is attached. It gives the meeting a defensible order: call to order, quorum confirmation, prior minutes, treasurer report, reserve fund update, old business, new business, owner forum, executive session when needed, and adjournment.",
    "Start with quorum. A board can discuss almost anything informally, but it cannot take valid action without the quorum your bylaws require. Confirming that number before approvals, vendor votes, or financial decisions protects the board record.",
    "We built Gavelhouse because volunteer boards should not have to reconstruct meeting procedure from memory. Use the agenda first -- then we can show you how meetings, minutes, votes, and records stay connected.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The agenda item that protects every vote",
      preheader:
        "Quorum belongs before approvals, reports, motions, and vendor decisions.",
      heading: "Quorum confirmation belongs near the top",
      bodyMarkdown: [
        "Quick note from the agenda template: quorum is not a formality. It is the condition that makes the board's votes valid. If quorum is confirmed after the first approval, the minutes leave room for an owner, vendor, or future director to argue that the early action never had authority.",
        "Put quorum immediately after call to order. Record who was present, whether the threshold was met, and the bylaw or governing document rule the secretary used. If quorum is missing, adjourn instead of improvising around it.",
        "A clean quorum line in the minutes is boring in the best possible way. It makes the record harder to challenge later.",
      ].join("\n\n"),
      ctaLabel: "Read the meeting minutes guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-meeting-minutes-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: the annual meeting planner",
      preheader:
        "Board meetings and annual meetings fail for different procedural reasons.",
      heading: "Use a separate planner for the annual meeting",
      bodyMarkdown: [
        "The board agenda template covers regular board meetings. The annual meeting has a different risk profile: owner notice, ballots, proxies, quorum of voting interests, election procedure, and minutes that show the result clearly enough to survive a later challenge.",
        "That is why the **HOA Annual Meeting Planner** is the companion resource. It works backwards from the meeting date so notice deadlines, ballot logistics, and quorum math are settled before the room fills up.",
        "Use the board agenda for monthly governance. Use the planner when owners vote, directors change, or the association needs a record that affects the whole membership.",
      ].join("\n\n"),
      ctaLabel: "Get the annual meeting planner",
      ctaUrl: canonicalMarketingUrl("/free/hoa-annual-meeting-planner/"),
    },
    {
      dayOffset: 9,
      subject: "Executive session should not swallow the record",
      preheader:
        "Closed discussion still needs a public record of why it happened.",
      heading: "Executive session needs a narrow purpose",
      bodyMarkdown: [
        "Executive session is where boards handle litigation, personnel matters, contract negotiation, delinquencies, and other sensitive topics. It is not a place to move every hard conversation out of view. Most statutes and governing documents expect a reason to be stated and a limited record to remain.",
        "The agenda should list executive session only when a qualifying topic exists. The minutes should record that the board entered executive session, the general category discussed, and when the open meeting resumed. Do not record privileged detail in the public minutes.",
        "Gavelhouse keeps public minutes, private records, and related documents separated so confidentiality does not turn into missing documentation.",
      ].join("\n\n"),
      ctaLabel: "See governance record retention",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-secretary-software/"),
    },
    {
      dayOffset: 14,
      subject: "Run meetings from the same system as the records",
      preheader: `Agenda, minutes, votes, documents, and audit trail -- flat pricing, ${trialDurationLabel} trial.`,
      heading: startWithOffer,
      bodyMarkdown: [
        "A template makes the next meeting cleaner. A system of record makes every meeting easier to defend. In Gavelhouse, agenda items connect to minutes, votes, documents, financial reports, and retention history instead of living in a one-off document folder.",
        "That matters when a lender, owner, auditor, or incoming board asks why a decision was made. The answer should be a traceable record, not a search through old email threads.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const reserveStudyRfpTemplate: MagnetEmailConfig = {
  slug: "reserve-study-rfp-template",
  title: "Reserve Study RFP Template",
  personaTag: "Treasurer / Board president",
  deliverySubject: "Your Reserve Study RFP Template is ready",
  deliveryPreheader:
    "Scope, credentials, deliverables, pricing, and timeline in one request.",
  deliveryBodyMarkdown: [
    "Your **Reserve Study RFP Template** is attached. It gives boards a structured way to ask reserve study professionals for the same scope, credentials, deliverables, timeline, and pricing breakdown so bids can be compared on equal terms.",
    "Start with credentials. In several states, reserve study work must be performed or reviewed by a qualified professional. Even where it is not required, asking every bidder to list reserve credentials, engineering involvement, and recent association work creates a cleaner board record.",
    "We built Gavelhouse because reserve compliance starts before the study lands in the inbox. Use the RFP first -- then track the resulting study, funding plan, and board decisions in one system.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "Do not compare reserve bids by price alone",
      preheader:
        "Scope differences make cheap reserve-study bids expensive later.",
      heading: "Normalize the scope before comparing bids",
      bodyMarkdown: [
        "Quick note on the RFP: a low reserve study bid often means a narrower scope. One proposal may include a site visit, component inventory, useful-life estimates, and a 30-year funding plan. Another may only update last year's numbers from a spreadsheet.",
        "Before the board compares price, confirm that every bidder is pricing the same work: physical analysis, financial analysis, component list, funding model, draft review, final report, and delivery format. Ask them to identify exclusions explicitly.",
        "A board that chooses a cheap incomplete study may still have to defend why the reserve plan failed. Scope clarity is what makes the decision defensible.",
      ].join("\n\n"),
      ctaLabel: "Read the reserve study guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-reserve-study-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: state reserve requirements",
      preheader:
        "The RFP should ask for the deliverables your state actually requires.",
      heading: "State law should shape the RFP",
      bodyMarkdown: [
        "The RFP is only useful if it asks for the right deliverables. The **50-State Reserve Fund Requirements** reference tells you whether your state requires reserve studies, disclosures, baseline funding, structural inspections, or specific update cadences.",
        "Add your state's requirements directly into the RFP before sending it. If a bidder cannot explain how their deliverable satisfies the state rule, the board should know that before signing, not when a lender or owner asks for proof.",
        "This is where a generic reserve study becomes a compliance artifact. The board is not just buying a report; it is buying evidence that it understood and acted on the rule.",
      ].join("\n\n"),
      ctaLabel: "Get the 50-state reference",
      ctaUrl: canonicalMarketingUrl(
        "/free/50-state-reserve-fund-requirements/",
      ),
    },
    {
      dayOffset: 9,
      subject: "What to do after the study is delivered",
      preheader:
        "A reserve study does not protect the board until the funding decision is recorded.",
      heading: "The board still has to adopt a funding plan",
      bodyMarkdown: [
        "The biggest post-RFP mistake is treating the delivered reserve study as the finish line. It is not. The study gives the board a funding recommendation. The board still has to review it, adopt a contribution plan, and record the decision in the minutes and budget.",
        "If the board chooses a lower contribution than the study recommends, document the reason and the risk. Silence is what creates the liability problem later, especially when deferred maintenance or a special assessment follows.",
        "Gavelhouse connects the study to reserve budgets, percent-funded reporting, and minutes so the decision trail is not separated from the financial record.",
      ].join("\n\n"),
      ctaLabel: "See reserve compliance workflows",
      ctaUrl: canonicalMarketingUrl(
        "/product/hoa-reserve-fund-compliance-software/",
      ),
    },
    {
      dayOffset: 14,
      subject: "Turn the reserve study into live compliance",
      preheader:
        "Track the study, funding plan, percent-funded ratio, and board decisions in one place.",
      heading: startWithOffer,
      bodyMarkdown: [
        "The RFP gets you a better study. Gavelhouse helps the board use it. Store the report, track the funding plan, compare actual reserve contributions against the recommendation, and keep percent-funded reporting tied to the ledger.",
        "That matters because a reserve study sitting in a folder does not change the community's risk. The value comes when the board turns it into budget lines, transfers, disclosures, and minutes that show the duty was discharged.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const fiduciaryDutyChecklist: MagnetEmailConfig = {
  slug: "hoa-fiduciary-duty-checklist",
  title: "HOA Board Fiduciary Duty Checklist",
  personaTag: "Board director",
  deliverySubject: "Your HOA Fiduciary Duty Checklist is ready",
  deliveryPreheader:
    "Duty of care, loyalty, records, reserves, conflicts, and documented votes.",
  deliveryBodyMarkdown: [
    "Your **HOA Board Fiduciary Duty Checklist** is attached. It translates the abstract duties of care, loyalty, and obedience into board actions: reviewing financials, separating reserve funds, disclosing conflicts, recording votes, retaining records, and following governing documents.",
    "Start with conflicts. A director who benefits from a vendor decision, collection action, or architectural approval needs the conflict disclosed in the minutes before the vote. Silence is what turns an ordinary board decision into a personal exposure question.",
    "We built Gavelhouse because fiduciary duty is mostly documentation. Use the checklist first -- then keep the board's financial, governance, and record-retention evidence in one place.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The duty of care is a paper trail",
      preheader:
        "Boards do not just need to make reasonable decisions; they need evidence.",
      heading: "Reasonable decisions need documented inputs",
      bodyMarkdown: [
        "Quick note from the checklist: the duty of care usually asks whether directors made an informed, reasonable decision. That means the board needs evidence of the information reviewed before the vote: financial reports, vendor bids, legal advice, reserve studies, owner notices, and meeting discussion.",
        "The minutes do not need to transcribe every sentence. They do need to show that the board reviewed the relevant materials and acted through a valid vote. Attach or reference the supporting documents while the decision is fresh.",
        "A defensible board record is not dramatic. It is a tidy trail from agenda to materials to vote to follow-through.",
      ].join("\n\n"),
      ctaLabel: "Read the board liability guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-board-liability-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: board transition checklist",
      preheader: "Fiduciary duty does not pause when directors change seats.",
      heading: "Transition is a fiduciary duty moment",
      bodyMarkdown: [
        "The fiduciary checklist covers what directors owe while they serve. The **HOA Board Transition Checklist** covers the moment those duties change hands. Banking access, insurance names, vendor contracts, records, keys, and logins all need to move cleanly to the incoming board.",
        "A messy handover creates immediate duty-of-care risk for the new board and duty-of-loyalty questions for the outgoing board if records are withheld. The transition record should show what was transferred, when, and by whom.",
        "Use both checklists together whenever directors change. The cleanest liability protection is continuity, not a heroic reconstruction after something goes wrong.",
      ].join("\n\n"),
      ctaLabel: "Get the transition checklist",
      ctaUrl: canonicalMarketingUrl("/free/hoa-board-transition-checklist/"),
    },
    {
      dayOffset: 9,
      subject: "Reserve commingling is fiduciary evidence",
      preheader:
        "A reserve mistake is not just accounting; it can document breach of duty.",
      heading: "Commingled funds make duty harder to defend",
      bodyMarkdown: [
        "One fiduciary risk the checklist surfaces quickly: operating and reserve funds cannot be treated as one informal cash pool. If the board uses reserve money for operating shortfalls without proper authorization, repayment plan, and documentation, the issue becomes more than bookkeeping.",
        "Most boards do not intend to commingle. It happens because spreadsheets and general accounting tools allow it. A class tag or memo field does not enforce fund separation when a volunteer treasurer is moving quickly.",
        "Gavelhouse enforces fund separation in the ledger so the board's fiduciary record is supported by the system, not dependent on someone remembering a spreadsheet convention.",
      ].join("\n\n"),
      ctaLabel: "See fund separation",
      ctaUrl: canonicalMarketingUrl("/product/hoa-fund-accounting-software/"),
    },
    {
      dayOffset: 14,
      subject: "Make fiduciary evidence easier to keep",
      preheader:
        "Financials, votes, conflicts, records, and retention in one system.",
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist tells directors what to document. Gavelhouse gives the board a place to keep the evidence: separated funds, board-ready reports, meeting minutes, vote records, conflict notes, document retention, and exportable audit packs.",
        "That matters because fiduciary protection rarely comes from one perfect document. It comes from a consistent system showing that the board reviewed, decided, recorded, and retained the right information over time.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const collectionsPolicyTemplate: MagnetEmailConfig = {
  slug: "hoa-collections-policy-template",
  title: "HOA Collections Policy Template",
  personaTag: "Treasurer / Board president",
  deliverySubject: "Your HOA Collections Policy Template is ready",
  deliveryPreheader:
    "Delinquency notices, payment plans, board approval, liens, and records.",
  deliveryBodyMarkdown: [
    "Your **HOA Collections Policy Template** is attached. It helps boards define when assessments become delinquent, when notices go out, when payment plans are offered, when attorney escalation begins, and what approvals are required before liens or foreclosure steps.",
    "Start with consistency. A collections policy protects the association only if the board applies it the same way to every owner. Ad hoc exceptions create fairness issues and can weaken the board's position when a delinquent account becomes disputed.",
    "We built Gavelhouse because collections need both accounting and governance records. Use the policy first -- then track balances, notices, decisions, and owner history together.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "Collections policy is about consistency",
      preheader:
        "The risk is not only unpaid dues; it is uneven treatment of owners.",
      heading: "Apply the same timeline to every account",
      bodyMarkdown: [
        "Quick note from the policy template: collections disputes often turn on whether the board applied its own rules consistently. If one owner receives three informal reminders and another goes straight to attorney notice, the board has created a fairness problem on top of a cash problem.",
        "Define the timeline in advance: due date, grace period, first notice, late charge, payment plan window, board review, attorney handoff, lien authorization. Then follow that timeline unless the board records a specific reason for an exception.",
        "A written process reduces awkward judgment calls for volunteer directors and gives the association a cleaner record when an account escalates.",
      ].join("\n\n"),
      ctaLabel: "Read delinquent account procedures",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-delinquent-account-procedures/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Companion: HOA budget template",
      preheader:
        "Collections policy and annual budget assumptions should agree.",
      heading: "Tie collections policy back to the budget",
      bodyMarkdown: [
        "The collections policy controls how the board responds after dues are late. The **HOA Budget Template** helps the board avoid pretending every dollar will arrive on time. Delinquency assumptions, bad debt reserves, and cash timing should be visible before the year starts.",
        "If the annual budget assumes perfect collections, the board may cover shortfalls with reserves or delayed maintenance when accounts age past 60 or 90 days. That turns a collections issue into a reserve and fiduciary issue.",
        "Use the policy and budget together. One defines the process; the other shows whether the association can absorb the timing risk.",
      ].join("\n\n"),
      ctaLabel: "Get the budget template",
      ctaUrl: canonicalMarketingUrl("/free/hoa-budget-template/"),
    },
    {
      dayOffset: 9,
      subject: "Do not let collections records live in email",
      preheader:
        "Notices, promises, payment plans, and board decisions need one record.",
      heading: "Collections history should be account-level evidence",
      bodyMarkdown: [
        "When an owner account escalates, the association needs a complete history: assessment dates, payments, late fees, notices, payment plan offers, board approvals, attorney handoff, and lien decisions. If that history lives across email, spreadsheets, and meeting notes, reconstruction becomes expensive.",
        "The policy should say where records are kept and who updates them. That is not administrative trivia. It is the evidence trail the association needs if the owner disputes charges or claims the board skipped required notice.",
        "Gavelhouse keeps owner balances, notices, notes, and board actions tied to the same account record instead of scattering collections evidence across tools.",
      ].join("\n\n"),
      ctaLabel: "See owner and governance workflows",
      ctaUrl: canonicalMarketingUrl("/solutions/self-managed-hoa-software/"),
    },
    {
      dayOffset: 14,
      subject: "Manage dues and collections from one record",
      preheader: `Balances, notices, decisions, and audit trail -- flat pricing, ${trialDurationLabel} trial.`,
      heading: startWithOffer,
      bodyMarkdown: [
        "A collections policy gives the board a standard. Gavelhouse gives the board the operating record to follow it: assessment balances, delinquency aging, notices, payment history, board decisions, and exportable evidence when an account needs review.",
        "That matters because collections is where financial administration and governance collide. A treasurer needs the numbers; the board needs the decision trail; the association needs a record that is consistent for every owner.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const cybersecurityChecklist: MagnetEmailConfig = {
  slug: "hoa-cybersecurity-checklist",
  title: "HOA Cybersecurity Checklist",
  personaTag: "Board officer",
  deliverySubject: "Your HOA Cybersecurity Checklist is ready",
  deliveryPreheader:
    "Banking, email, vendor access, owner data, passwords, and transition controls.",
  deliveryBodyMarkdown: [
    "Your **HOA Cybersecurity Checklist** is attached. It focuses on the risks volunteer boards actually face: shared email accounts, reused passwords, former directors with vendor access, weak bank controls, owner data in personal drives, and phishing around dues or vendor payments.",
    "Start with access. Every director, vendor, bookkeeper, and management volunteer should have their own login where possible. Shared credentials make it impossible to know who changed a bank instruction, downloaded owner data, or deleted a record.",
    "We built Gavelhouse because governance records and owner data deserve better than a shared inbox. Use the checklist first -- then centralize the workflows that should never depend on personal accounts.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The former-director login problem",
      preheader:
        "Board transition is when most access mistakes become permanent.",
      heading: "Remove access as part of transition",
      bodyMarkdown: [
        "Quick note from the cybersecurity checklist: former directors often keep access long after their term ends. Bank portals, vendor dashboards, shared drives, domain registrars, website accounts, insurance portals, and email aliases can all outlive the board transition if nobody owns the access review.",
        "Add access removal to the transition agenda. Record who removed each account, when, and which replacement director now owns the login. Where possible, use role-based accounts with individual users instead of a shared password passed between boards.",
        "This is not about distrust. It is about proving who had authority when money, records, or owner data moved.",
      ].join("\n\n"),
      ctaLabel: "Get the transition checklist",
      ctaUrl: canonicalMarketingUrl("/free/hoa-board-transition-checklist/"),
    },
    {
      dayOffset: 5,
      subject: "Owner data should not live in personal drives",
      preheader:
        "Membership rolls, delinquency records, and violation files need custody controls.",
      heading: "Personal storage creates record custody risk",
      bodyMarkdown: [
        "The highest-risk HOA data is usually scattered: owner emails in one director's contacts, delinquency spreadsheets in another's Drive, violation photos in text threads, insurance files in an old vendor portal. That creates cybersecurity risk and record custody risk at the same time.",
        "The checklist asks boards to identify every place owner data lives. If a director resigns, loses a laptop, or forwards a file to the wrong address, the board needs to know what data was exposed and whether the association still has the official copy.",
        "Gavelhouse centralizes records so custody does not depend on personal storage habits or whoever remembered the shared-drive password.",
      ].join("\n\n"),
      ctaLabel: "See document retention workflows",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-secretary-software/"),
    },
    {
      dayOffset: 9,
      subject: "Bank instruction changes need verification",
      preheader: "Vendor payment fraud often starts with one plausible email.",
      heading: "Treat payment changes as board-control events",
      bodyMarkdown: [
        "Most small-association cyber losses start with a believable request: a vendor asks to update ACH details, a director receives an invoice from a lookalike domain, or someone forwards wire instructions after a thread has been compromised.",
        "The checklist should become policy: no payment account change without out-of-band verification, no new vendor payment method without documented approval, and no urgent exception based only on email. The board should record the verification method alongside the payment change.",
        "Gavelhouse cannot stop every phishing attempt, but it can keep vendor records, approvals, and audit trails in one place so payment changes are harder to spoof and easier to review.",
      ].join("\n\n"),
      ctaLabel: "Read vendor contract controls",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-vendor-contract-checklist/",
      ),
    },
    {
      dayOffset: 14,
      subject: "Move sensitive board workflows out of shared inboxes",
      preheader: `Records, roles, approvals, and access history -- flat pricing, ${trialDurationLabel} trial.`,
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist closes the obvious gaps. Gavelhouse helps keep them closed by moving owner records, governance documents, board actions, vendor files, and financial workflows into a system with role-based access and an audit trail.",
        "For a volunteer board, that is the practical cybersecurity win: fewer personal accounts, fewer mystery copies, fewer shared passwords, and clearer custody when directors change. The board still needs good habits, but the system stops carrying so much risk in email.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const hoaNewsletterTemplate: MagnetEmailConfig = {
  slug: "hoa-newsletter-template",
  title: "HOA Newsletter Template",
  personaTag: "Secretary",
  deliverySubject: "Your HOA Newsletter Template is ready",
  deliveryPreheader:
    "Professionally formatted newsletter your board can use today.",
  deliveryBodyMarkdown: [
    "Your **HOA Newsletter Template** is attached. It includes a ready-to-use layout for monthly or quarterly community updates -- formatted so homeowners actually read it.",
    "The template covers what every HOA newsletter should include: upcoming meeting dates, maintenance and project updates, a brief financial note, rule reminders, and a community spotlight section. Edit the placeholders, add your community name, and distribute.",
    "We built Gavelhouse because secretaries on volunteer boards shouldn't spend hours formatting communications from scratch. Use the template to get your next newsletter out this week -- then we'll show you how Gavelhouse makes recurring communications consistent and archivable.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "What goes in an HOA newsletter (and what should not)",
      preheader:
        "Rule reminders and financial updates matter. Personal grievances do not.",
      heading: "HOA newsletter dos and don'ts",
      bodyMarkdown: [
        "A quick note on content: the most common newsletter mistake is including information that creates legal exposure. Calling out individual homeowners by name for violations, disclosing private financial details about specific units, or speculating about upcoming assessments without board authorization -- all of these have generated real disputes.",
        "What belongs in every newsletter: upcoming meeting date and agenda, maintenance project status, reserve fund health (in summary terms), and any rule reminders relevant to the current season. What stays off the page: anything that reads like a complaint, individual homeowner business, or unverified legal conclusions.",
        "The template we sent draws those lines explicitly. Use the comment placeholders as a checklist before you send.",
      ].join("\n\n"),
      ctaLabel: "Read the HOA meeting minutes guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-meeting-minutes-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Does your state require notices to go out a specific way?",
      preheader:
        "Email newsletters and required legal notices are different things.",
      heading: "Newsletters vs. required legal notices",
      bodyMarkdown: [
        "A newsletter is discretionary communication. Required legal notices -- special assessment notices, meeting notices, fine hearing notices -- have specific delivery rules under your state's HOA statute and your CC&Rs. These are not interchangeable.",
        "Most states require notice of board meetings and annual meetings by first-class mail or email (if homeowners have opted in). Florida's HB 1021 tightened these requirements in 2023. California's Davis-Stirling Act has its own notice matrix. What you email in a friendly newsletter does not satisfy a statutory notice requirement.",
        "Gavelhouse tracks notice delivery separately from general communications -- so your compliance record stays clean regardless of your newsletter cadence.",
      ].join("\n\n"),
      ctaLabel: "See how Gavelhouse tracks board communications",
      ctaUrl: canonicalMarketingUrl("/solutions/hoa-board-secretary-software/"),
    },
    {
      dayOffset: 9,
      subject: "Keeping a newsletter archive boards can actually find",
      preheader:
        "Past newsletters matter when disputes arise. Where are yours?",
      heading: "Your newsletter archive is a governance record",
      bodyMarkdown: [
        "Newsletters sometimes become evidence. When a homeowner claims the board never notified the community about a rule change, the audit trail -- what was sent, when, to whom -- matters. If your past newsletters are scattered across personal email accounts or a shared Google Drive folder only one board member can access, that audit trail is effectively gone.",
        "Board turnover makes this worse. A secretary who leaves takes institutional knowledge with them. Three years of newsletters in their personal inbox go with them.",
        "We built Gavelhouse to keep governance records in a system that belongs to the association, not the individual. Communications, minutes, financial reports -- they stay accessible when officers change.",
      ].join("\n\n"),
      ctaLabel: "See how document management works",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-document-management-guide/",
      ),
    },
    {
      dayOffset: 14,
      subject: "Ready to move board communications out of personal email?",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The newsletter template handles this month's communication. Gavelhouse handles the recurring governance infrastructure: document storage with access controls, board communication history, violation tracking, and financial reporting -- all in a system that survives officer turnover.",
        "Every communication you send through Gavelhouse is logged with a timestamp and retained for the record. When a homeowner disputes whether they received a notice, the answer is in the system -- not in someone's personal inbox.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const hoaBudgetChecklist: MagnetEmailConfig = {
  slug: "hoa-budget-checklist",
  title: "HOA Annual Budget Checklist",
  personaTag: "Treasurer",
  deliverySubject: "Your HOA Budget Checklist is ready",
  deliveryPreheader:
    "Plan, draft, and present your annual budget with confidence.",
  deliveryBodyMarkdown: [
    "Your **HOA Annual Budget Checklist** is attached. It walks through the budget process in three phases: data gathering (90+ days before fiscal year), draft preparation (60–30 days out), and board adoption and homeowner distribution.",
    "The reserve contribution line is where most volunteer treasurers underbudget. The checklist includes a reminder to pull your current reserve study's recommended annual contribution -- not last year's number, not a round figure, but the amount the study says you need to stay on the funding trajectory you committed to.",
    "We built Gavelhouse because this process should be repeatable, not rebuilt every year from scratch. Use the checklist this cycle -- then we'll show you how Gavelhouse automates the parts that currently live in your spreadsheet.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject: "The reserve line is where HOA budgets go wrong",
      preheader: "Underfunding reserves now means special assessments later.",
      heading: "Reserve contributions are not optional",
      bodyMarkdown: [
        "The most consequential budget decision your board makes each year is how much to contribute to reserves. Most volunteer treasurers set this number by looking at last year's contribution and adjusting slightly. That approach drifts -- and over five years, the gap between what you've contributed and what the reserve study says you should have can be six figures.",
        "The right number is in your reserve study: the annual contribution recommended to keep you on your chosen funding path (minimum funding, threshold funding, or full funding). Pull that number before you finalize the draft. Lenders and auditors will.",
        "The checklist we sent prompts you to do exactly that -- pull the study's current-year recommendation and use it as the floor, not the ceiling.",
      ].join("\n\n"),
      ctaLabel: "Read the HOA reserve fund compliance guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-reserve-fund-compliance-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject: "Does your state require budget ratification by homeowners?",
      preheader: "Some states let homeowners veto the budget. Know your rules.",
      heading: "Budget adoption varies by state and governing documents",
      bodyMarkdown: [
        "In most states, the board adopts the budget and homeowners receive a copy -- they don't vote on it. But some states and some governing documents require a homeowner ratification process. If a majority of homeowners object within a set period, the budget can be rejected and the prior year's budget re-adopted.",
        "California's Davis-Stirling Act has this veto mechanism. Florida's HOA statute has specific distribution timing requirements. Check your CC&Rs and state law before you finalize the adoption timeline.",
        "The checklist includes a reminder to verify your adoption and distribution requirements before the board votes.",
      ].join("\n\n"),
      ctaLabel: "Read the HOA financial statements guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-fund-accounting-guide/",
      ),
    },
    {
      dayOffset: 9,
      subject: "Operating vs. reserve: the line your budget must hold",
      preheader:
        "Commingling funds in the budget creates accounting problems all year.",
      heading: "Budget structure determines your accounting all year",
      bodyMarkdown: [
        "How you structure your budget determines how you'll account for funds all year. If your budget treats operating and reserve expenses as a single pool, you'll spend the year manually tracking what came from where. Most volunteer treasurers do this in spreadsheets -- and most spreadsheets eventually have errors.",
        "A properly structured HOA budget has two distinct sections: operating income and expenses, and reserve contributions and expenditures. Transfers between them require board authorization and documentation. That separation is what auditors look for and what your state statute likely requires.",
        "We built Gavelhouse because this separation should be enforced at the system level, not maintained by spreadsheet discipline.",
      ].join("\n\n"),
      ctaLabel: "See how fund separation works in Gavelhouse",
      ctaUrl: canonicalMarketingUrl("/product/hoa-fund-accounting-software/"),
    },
    {
      dayOffset: 14,
      subject: "Move this year's budget into a system that holds it",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist helps you prepare this year's budget. Gavelhouse helps you execute against it: operating expenses tracked against budget line items, reserve contributions posted to the correct fund, budget vs. actual reports ready for every board meeting.",
        "The fund separation is enforced at the database layer -- not maintained by spreadsheet discipline. Operating funds and reserve funds cannot be commingled, which is the outcome your state statute and your CPA want to see.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const hoaBoardOnboardingKit: MagnetEmailConfig = {
  slug: "hoa-board-onboarding-kit",
  title: "HOA Board Member Onboarding Kit",
  personaTag: "Board Member",
  deliverySubject: "Your HOA Board Member Onboarding Kit is ready",
  deliveryPreheader:
    "Everything a new board member needs in the first 30 days.",
  deliveryBodyMarkdown: [
    "Your **HOA Board Member Onboarding Kit** is attached. It covers what every newly elected or appointed director needs to do in the first 30 days: access governing documents, review the financial position, understand outstanding obligations, and confirm key contacts.",
    "The most important section is the financial review checklist. New board members inherit whatever financial state the association is in -- including reserve deficiencies, outstanding delinquencies, and open vendor contracts. Getting current on those in the first two weeks is the difference between an orderly transition and a crisis.",
    "We built Gavelhouse because board turnover is one of the highest-risk moments for a self-managed HOA. Use the kit for this transition -- then we'll show you how Gavelhouse keeps the institutional knowledge in the system, not in the outgoing officer's head.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject:
        "The financial documents new board members must review immediately",
      preheader:
        "Reserve balance, outstanding assessments, and open contracts -- in that order.",
      heading: "Financial review: what to look at first",
      bodyMarkdown: [
        "New board members often focus on governing documents first. That is useful, but the financial review is more urgent. Here is what to pull in the first week: the most recent reserve fund balance, the current reserve study (look at the percent-funded figure), a delinquency report (how many units are behind and by how much), and a list of open vendor contracts with expiration dates.",
        "The reserve balance tells you whether the association has adequate capital for planned replacements. The delinquency report tells you whether operating cash flow is reliable. The vendor contracts tell you what commitments exist and when they can be renegotiated.",
        "If any of these documents don't exist or can't be produced by the outgoing treasurer within the first week, that gap is itself a governance finding.",
      ].join("\n\n"),
      ctaLabel: "Read the HOA treasurer duties guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-treasurer-annual-checklist/",
      ),
    },
    {
      dayOffset: 5,
      subject:
        "You now carry personal fiduciary duty. Here is what that means.",
      preheader:
        "Fiduciary duty attaches to directors individually, not just the association.",
      heading: "Fiduciary duty is personal",
      bodyMarkdown: [
        "As a board member, you have accepted a fiduciary duty to the homeowners in your community. That duty is personal. It does not disappear when you leave the board. Actions taken (or not taken) during your term can be examined long after your term ends.",
        "The duty has three components: care (making informed decisions), loyalty (no self-dealing or conflicts of interest), and obedience (following governing documents and state law). The most common fiduciary breach for volunteer boards is financial: underfunded reserves, commingled funds, inadequate insurance.",
        "Read the fiduciary duty checklist we also offer -- it is the practical application of this concept to day-to-day board decisions.",
      ].join("\n\n"),
      ctaLabel: "Get the fiduciary duty checklist",
      ctaUrl: canonicalMarketingUrl("/free/hoa-fiduciary-duty-checklist/"),
    },
    {
      dayOffset: 9,
      subject: "What the outgoing officer needs to hand off",
      preheader:
        "A clean handoff takes two weeks. An incomplete one takes two years.",
      heading: "The handoff checklist for outgoing officers",
      bodyMarkdown: [
        "Board transitions go wrong when outgoing officers don't fully transfer custody. The most common gaps: bank account signatories not updated, vendor login credentials not transferred, prior year financial records not handed over, insurance certificates not located.",
        "Every day those gaps persist, the incoming board is operating without full visibility into the association's financial and legal position. That is an unnecessary governance risk.",
        "The onboarding kit includes a companion handoff checklist for outgoing officers. Send it to whoever you are replacing.",
      ].join("\n\n"),
      ctaLabel: "Read the board transition guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-board-liability-guide/",
      ),
    },
    {
      dayOffset: 14,
      subject: "Keep institutional knowledge in the system, not in your inbox",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The onboarding kit gets you current. Gavelhouse keeps everything current -- financial records, governing documents, vendor contracts, violation history, board minutes -- in one place accessible to whoever holds the role, not just the person who set it up.",
        "When the next board transition happens, everything will already be there. Role-based access means incoming officers see exactly what they need from day one, without the outgoing officer having to transfer files manually.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const hoaReserveFundCalculator: MagnetEmailConfig = {
  slug: "hoa-reserve-fund-calculator",
  title: "HOA Reserve Fund Calculator",
  personaTag: "Treasurer",
  deliverySubject: "Your HOA Reserve Fund Calculator is ready",
  deliveryPreheader:
    "Calculate your percent-funded ratio and know where you stand.",
  deliveryBodyMarkdown: [
    "Your **HOA Reserve Fund Calculator** is attached. It includes a percent-funded worksheet, a component inventory template, and a funding plan comparison (minimum vs. threshold vs. full funding) so you can see what each path costs in annual contributions.",
    "Start with the percent-funded tab. Enter your current reserve balance and your reserve study's fully funded target. The result is the number Fannie Mae, Freddie Mac, and most condominium lenders use to judge whether your association is financially solvent. Below 70% raises flags. Below 30% means your community may not be able to get mortgages for unit sales.",
    "We built Gavelhouse because this calculation should not live in a one-time spreadsheet -- it should update automatically from your actual reserve ledger every month. Use the calculator now, then we'll show you the system behind it.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject:
        "What percent-funded actually means (it is not what most boards think)",
      preheader:
        "A high reserve balance does not mean you are adequately funded.",
      heading: "Percent-funded is a ratio, not a balance",
      bodyMarkdown: [
        "The most common misunderstanding in reserve fund management: a community with $400,000 in reserves assumes they are well-funded. But if the reserve study says they should have $1.2 million fully funded at this stage of the component life cycle, they are at 33% funded -- which is the threshold where lenders start flagging units for conventional mortgage restrictions.",
        "Percent-funded is your current reserve balance divided by your study's fully funded target at this point in time. Not the ultimate replacement cost -- the current-year target based on where each component is in its depreciation schedule.",
        "Run the calculator with your study's current-year number, not the final replacement cost. The gap will look different than you expect.",
      ].join("\n\n"),
      ctaLabel: "Read the reserve fund compliance guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-reserve-fund-compliance-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject:
        "Fannie Mae's reserve requirement for condos (and what triggers it)",
      preheader:
        "10% of gross assessments to reserves -- but that is just the floor.",
      heading: "What lenders actually require from your reserves",
      bodyMarkdown: [
        "Fannie Mae's selling guide requires condo associations to contribute at least 10% of the gross annual budget to reserves to qualify for conventional financing (the warrantable designation). This is often misread as a compliance target -- it is not. It is a floor that keeps your community eligible for conventional mortgages on unit sales.",
        "The 10% rule is separate from the percent-funded question. A community can meet the 10% contribution rule and still be underfunded if the contribution has been too low for years. The calculator's funding comparison tab shows both metrics.",
        "If your community is below warrantable status, unit sales may require cash buyers or portfolio lenders -- which typically means lower sale prices and longer time on market.",
      ].join("\n\n"),
      ctaLabel: "Get the 50-state reserve requirements reference",
      ctaUrl: canonicalMarketingUrl(
        "/free/50-state-reserve-fund-requirements/",
      ),
    },
    {
      dayOffset: 9,
      subject: "Why spreadsheet reserve tracking breaks at the worst time",
      preheader:
        "Reserve fund accuracy matters most when you can least afford errors.",
      heading: "The problem with spreadsheet reserve tracking",
      bodyMarkdown: [
        "Reserve tracking in a spreadsheet works until it does not. Common failure points: the spreadsheet lives on one treasurer's computer, the formula references a reserve study that is three years old, a reserve transfer is recorded as an operating expense by mistake, or the outgoing treasurer's data does not match what the incoming treasurer receives.",
        "None of these errors are obvious until something forces a reckoning -- a Fannie Mae form request, an audit, a special assessment vote. At that point, reconstructing the accurate reserve history from a spreadsheet can take weeks.",
        "We built Gavelhouse so the reserve ledger is the system of record. Every contribution and expenditure is posted to the correct fund with a timestamp and a recorded authorization. The percent-funded calculation updates automatically.",
      ].join("\n\n"),
      ctaLabel: "See how reserve tracking works",
      ctaUrl: canonicalMarketingUrl("/product/hoa-fund-accounting-software/"),
    },
    {
      dayOffset: 14,
      subject: "Move reserve tracking out of the spreadsheet permanently",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The calculator gives you a snapshot. Gavelhouse gives you a live reserve ledger: every contribution tracked, every expenditure authorized and recorded, percent-funded updated monthly from actual balances, and reserve history that survives board turnover.",
        "If a lender requests Fannie Mae Form 1076 or a reserve questionnaire, the numbers are in the system -- not in a spreadsheet that may or may not reflect the last six months of transactions. That accuracy matters when a unit sale depends on it.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const hoaCcrEnforcementChecklist: MagnetEmailConfig = {
  slug: "hoa-ccr-enforcement-checklist",
  title: "HOA CC&R Enforcement Checklist",
  personaTag: "Board Member",
  deliverySubject: "Your HOA CC&R Enforcement Checklist is ready",
  deliveryPreheader:
    "Step-by-step due process documentation that protects your board.",
  deliveryBodyMarkdown: [
    "Your **HOA CC&R Enforcement Checklist** is attached. It walks through every step of the violation process -- from first observation through hearing and fine -- with the documentation requirements at each stage.",
    "The most important part is the due process section. Boards that skip steps or document inconsistently are exposed to selective enforcement claims. When a homeowner argues that the board enforces rules against some residents but not others, the defense is your enforcement record. That record needs to show consistent process, documented notice, and recorded hearing outcomes.",
    "We built Gavelhouse because enforcement consistency should not depend on which board member handles the complaint this month. Use the checklist to standardize your process -- then we'll show you how Gavelhouse tracks it automatically.",
  ].join("\n\n"),
  steps: [
    {
      dayOffset: 2,
      subject:
        "Selective enforcement claims: what they are and how to prevent them",
      preheader:
        "Inconsistent enforcement is the most common reason boards lose disputes.",
      heading: "Why consistent enforcement matters legally",
      bodyMarkdown: [
        "Selective enforcement is a legal defense available to homeowners facing fines or liens. The argument: the board enforces the rule against me, but not against others who commit the same violation. If a court agrees, the board's enforcement action can be voided -- and in some states, the board can be liable for attorney's fees.",
        "The defense to a selective enforcement claim is documentation. If your enforcement records show that every violation of the same rule triggers the same process -- same notice, same cure timeline, same fine schedule -- the selective enforcement argument loses its foundation.",
        "The checklist builds that consistency into each step of the process.",
      ].join("\n\n"),
      ctaLabel: "Read the HOA violation enforcement guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-violation-enforcement-guide/",
      ),
    },
    {
      dayOffset: 5,
      subject:
        "The hearing requirement boards regularly skip (and why it matters)",
      preheader:
        "A fine without a proper hearing offer is procedurally defective in most states.",
      heading: "Hearing rights are not optional",
      bodyMarkdown: [
        "Most state HOA statutes require that a homeowner be offered a hearing before a fine is imposed. California's Davis-Stirling Act requires it. Florida's Chapter 720 requires it. Nevada's NRS 116 requires it. The specific timing and notice requirements vary by state, but the pattern is consistent: notice, opportunity to be heard, then fine.",
        "Boards that skip the hearing offer -- even when they are confident the violation is clear -- are creating procedurally defective fines. A defective fine process can render the fine uncollectable and expose the board to counterclaims.",
        "The checklist includes the hearing notice language and the required pre-hearing timeline.",
      ].join("\n\n"),
      ctaLabel: "Read the CC&R covenants guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-ccr-covenants-guide/",
      ),
    },
    {
      dayOffset: 9,
      subject: "Documenting violations: what counts as evidence",
      preheader:
        "Photos, dates, notice method, and officer name -- document all of it.",
      heading: "What a complete violation record looks like",
      bodyMarkdown: [
        "A violation record that holds up in court or in arbitration contains: the date of observation, a description of the specific CC&R provision violated, the name of the officer or inspector who observed it, a photograph with metadata (date and location embedded), the method of notice delivery (certified mail return receipt, personal service, or posting), and the cure deadline given.",
        "Verbal warnings that are not documented do not exist in the legal record. Board meeting discussions about a violation that are not in the minutes are not reliable evidence. The enforcement record is what you filed, sent, and received back.",
        "The checklist has a documentation checklist for each stage of the process.",
      ].join("\n\n"),
      ctaLabel: "Read the collections policy guide",
      ctaUrl: canonicalMarketingUrl(
        "/resources/guides/hoa-collection-policy-template/",
      ),
    },
    {
      dayOffset: 14,
      subject:
        "Move enforcement out of email threads and into a trackable system",
      preheader: offerPreheader,
      heading: startWithOffer,
      bodyMarkdown: [
        "The checklist standardizes your enforcement process. Gavelhouse tracks it: every violation recorded with date, photo, and notice sent, every hearing documented, every fine calculated against your approved schedule. The enforcement history is searchable, exportable, and survives board turnover.",
        "When a homeowner claims selective enforcement, the defense is the record. Gavelhouse gives you that record in a format that holds up -- organized by violation type, date, and disposition, not buried in an email thread from three board members ago.",
        standardOfferBody,
      ].join("\n\n"),
      ctaLabel: startWithOffer,
      ctaUrl: canonicalPricingUrl,
    },
  ],
};

const magnetConfigs: MagnetEmailConfig[] = [
  reserveFundCalculator,
  annualMeetingPlanner,
  evaluationScorecard,
  boardTransitionChecklist,
  budgetTemplate,
  reserveComplianceChecklist,
  fiftyStateReserveReference,
  boardMeetingAgendaTemplate,
  reserveStudyRfpTemplate,
  fiduciaryDutyChecklist,
  collectionsPolicyTemplate,
  cybersecurityChecklist,
  hoaNewsletterTemplate,
  hoaBudgetChecklist,
  hoaBoardOnboardingKit,
  hoaReserveFundCalculator,
  hoaCcrEnforcementChecklist,
];

export function validateMagnetConfigRoutes(configs: MagnetEmailConfig[]): void {
  for (const config of configs) {
    for (const step of config.steps) {
      const url = new URL(step.ctaUrl);
      if (url.origin !== canonicalMarketingOrigin) {
        throw new Error(
          `Invalid CTA origin for ${config.slug}: ${step.ctaUrl}`,
        );
      }

      for (const prefix of DISALLOWED_CTA_PATH_PREFIXES) {
        if (url.pathname.startsWith(prefix)) {
          throw new Error(
            `Legacy CTA path "${url.pathname}" is not allowed for ${config.slug}.`,
          );
        }
      }
    }
  }
}

validateMagnetConfigRoutes(magnetConfigs);

export default magnetConfigs;

/**
 * Lookup helper. Throws when slug is unknown -- callers should have already
 * validated via the shared Zod enum, so an unknown slug indicates a bug.
 */
export function getMagnetConfig(slug: LeadMagnetSlug): MagnetEmailConfig {
  const found = magnetConfigs.find((m) => m.slug === slug);
  if (!found) {
    throw new Error(`No magnet email config for slug: ${slug}`);
  }
  return found;
}

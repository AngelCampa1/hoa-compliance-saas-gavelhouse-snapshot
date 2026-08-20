export const marketingSeed = {
  schemaVersion: "2026-05-knowledge-v1",
  domain: "marketing",
  product: {
    id: "gavelhouse",
    name: "Gavelhouse",
    domain: "gavelhouse.app",
    category: "HOA Community Association Management",
    tagline: "Is your HOA reserve fund compliant?",
    description:
      "Gavelhouse helps self-managed HOA and condo boards keep money, meetings, owners, and records in one clear place.",
    targetAudience: "Self-managed HOA and condo boards with up to 500 homes",
    targetAudienceShort: "Volunteer boards",
    benefits: [
      "State rule tracking",
      "Finance, meetings, and owner work in one place",
      "Separate funds and clear reports",
      "Flat pricing with no per-unit fees",
    ],
    trustSignals: [
      {
        text: "State rule tracking",
        category: "compliance",
      },
      {
        text: "Separate operating and reserve funds",
        category: "compliance",
      },
      {
        text: "Reports your board can read",
        category: "feature",
      },
      {
        text: "Meetings, votes, and owner work in one place",
        category: "feature",
      },
      {
        text: "Flat pricing your board can approve in one meeting",
        category: "roi",
      },
    ],
  },
  offer: {
    id: "limited-80-off",
    code: "Y80OFF",
    label: "80% off the first year",
    badgeLabel: "80% off first year",
    percentOff: 80,
    totalRedemptionLimit: 300,
    monthly: {
      id: "M80OFF",
      name: "80% OFF - Monthly",
      code: "M80OFF",
      terms: "80% off your first year",
      redemptionLimit: 100,
    },
    annual: {
      id: "Y80OFF",
      name: "80% OFF - Yearly",
      code: "Y80OFF",
      terms: "80% off your first year",
      redemptionLimit: 200,
    },
    guaranteeDays: 30,
    guaranteeLabel: "30-day money-back guarantee",
    setupFee: "$0",
    contract: "Month-to-month",
  },
  founderContact: {
    email: "angel.campa@gavelhouse.app",
    contactPath: "/contact/",
  },
  funnel: {
    tofu: {
      ctaMode: "educate",
      ctaText: "See guides",
      ctaTarget: "/resources/",
    },
    mofu: {
      ctaMode: "evaluate",
      ctaText: "Compare tools",
      ctaTarget: "/compare/alternatives/payhoa/",
    },
    bofu: {
      ctaMode: "convert",
      ctaText: "Start trial",
      ctaTarget: "https://my.gavelhouse.app/signup",
    },
    ctaSubtitle: "Try Scale features first. Pick a plan later.",
    publicSignupUrl: "https://my.gavelhouse.app/signup",
  },
  pricing: {
    updatedAt: "2026-04-21",
    displayRange: "about $10-$50/mo billed annually with Y80OFF",
    plans: [
      {
        id: "starter",
        name: "Starter",
        complianceScope: "Small-board compliance",
        price: "$10/mo",
        monthlyPriceCents: 5900,
        annualPriceCents: 4900,
        annualTotalPriceCents: 58800,
        description: "Up to 50 homes",
        features: [
          "Reserve/operating fund enforced separation (CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364)",
          "Reserve-study deadline tracking for your state's statute",
          "Dues tracking and online payments with receipts on record",
          "Core homeowner directory and governance records",
          "Up to 3 board users",
        ],
        maxHomes: 50,
        whoItsFor:
          "A single volunteer board self-managing one community up to 50 homes",
        outcome:
          "Start with cleaner reserve records and an easier treasurer handoff",
        notIdealFor:
          "Multi-community operators or property managers billing multiple clients.",
      },
      {
        id: "growth",
        name: "Growth",
        complianceScope: "Mid-size board + owner operations",
        price: "$27/mo",
        monthlyPriceCents: 16500,
        annualPriceCents: 13500,
        annualTotalPriceCents: 162000,
        description: "51-200 homes",
        features: [
          "Reserve/operating fund enforced separation (CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364)",
          "Reserve-study deadline tracking for your state's statute",
          "Governance records with full audit trail on owner requests",
          "Owner portal with request visibility and audit-trail (FL Section 720.303(5), CA Section 4525)",
          "Automated dues reminders and delinquency tracking",
          "Up to 10 board users",
        ],
        highlighted: true,
        maxHomes: 200,
        whoItsFor:
          "A mid-size volunteer board that needs owner-facing operations alongside fund compliance",
        outcome:
          "Keep reserve records clearer and give owners a place to check requests",
        notIdealFor:
          "Communities under 50 homes that only need fund separation and basic recordkeeping. Starter covers that",
      },
      {
        id: "scale",
        name: "Scale",
        complianceScope: "Audit-grade oversight",
        price: "$50/mo",
        monthlyPriceCents: 29900,
        annualPriceCents: 24900,
        annualTotalPriceCents: 298800,
        description: "201-500 homes",
        features: [
          "Reserve/operating fund enforced separation (CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364)",
          "Reserve-study tracking with per-community deadline alerts",
          "Governance records plus financial packet exports",
          "Owner portal with request visibility and audit-trail (FL Section 720.303(5), CA Section 4525)",
          "General ledger and core financial reports",
          "Audit-packet exports formatted for CA/FL/WA statutory review",
          "Month-end close workflow with attested balances",
          "Unlimited board users, priority support",
        ],
        maxHomes: 500,
        whoItsFor:
          "A larger self-managed community that needs audit-grade reporting and month-end close",
        outcome: "Export the financial packet an auditor or lender may ask for",
        notIdealFor:
          "Small boards that don't yet need audit-pack exports, month-end close, or a general ledger. Growth covers that",
      },
    ],
    config: {
      trialBannerText:
        "The board keeps the record. Annual billing is selected by default.",
      annualSavingsText: "20% off annual",
      monthlyToggleLabel: "Monthly",
      annualToggleLabel: "Annual",
      promoCode: "Y80OFF",
      promoText:
        "Limited time offer: 80% off the first year. Use M80OFF monthly or Y80OFF yearly.",
      guaranteeText: "30-day money-back guarantee.",
    },
    featureRows: [
      "Reserve/operating fund separation",
      "State compliance tracking",
      "Dues ledger",
      "Owner portal",
      "Board meetings and votes",
      "Architectural requests",
      "General ledger",
      "Audit packet exports",
      "Month-end close",
      "Priority support",
    ],
    featureAvailability: [
      {
        label: "Reserve/operating fund separation",
        availability: {
          starter: true,
          growth: true,
          scale: true,
        },
      },
      {
        label: "State compliance tracking",
        availability: {
          starter: true,
          growth: true,
          scale: true,
        },
      },
      {
        label: "Dues ledger",
        availability: {
          starter: true,
          growth: true,
          scale: true,
        },
      },
      {
        label: "Owner portal",
        availability: {
          starter: false,
          growth: true,
          scale: true,
        },
      },
      {
        label: "Board meetings and votes",
        availability: {
          starter: false,
          growth: true,
          scale: true,
        },
      },
      {
        label: "Architectural requests",
        availability: {
          starter: false,
          growth: true,
          scale: true,
        },
      },
      {
        label: "General ledger",
        availability: {
          starter: false,
          growth: false,
          scale: true,
        },
      },
      {
        label: "Audit packet exports",
        availability: {
          starter: false,
          growth: false,
          scale: true,
        },
      },
      {
        label: "Month-end close",
        availability: {
          starter: false,
          growth: false,
          scale: true,
        },
      },
      {
        label: "Priority support",
        availability: {
          starter: false,
          growth: false,
          scale: true,
        },
      },
    ],
    faqs: [
      {
        id: "is-pricing-per-door",
        question: "Is pricing per door?",
        answer: "No. Pricing is flat per community size and billed annually.",
      },
      {
        id: "can-we-try-it-before-the-board-commits",
        question: "Can we try it before the board commits?",
        answer:
          "Yes. Start the trial and evaluate the workflow before billing begins.",
      },
      {
        id: "what-happens-if-we-outgrow-a-tier",
        question: "What happens if we outgrow a tier?",
        answer:
          "Move to the tier that matches the community size. The record stays intact.",
      },
      {
        id: "do-you-give-legal-advice",
        question: "Do you give legal advice?",
        answer: "No. Gavelhouse is an operating tool, not legal counsel.",
      },
      {
        id: "can-we-export-records",
        question: "Can we export records?",
        answer: "Yes. You can export records for board review.",
      },
      {
        id: "who-answers-questions",
        question: "Who answers questions?",
        answer: "Email angel.campa@gavelhouse.app and the builder answers.",
      },
    ],
  },
  faqs: [
    {
      id: "how-much-does-gavelhouse-cost",
      question: "How much does Gavelhouse cost?",
      answer:
        "Annual billing is the default. With Y80OFF, Starter is about $10/mo, Growth is about $27/mo, and Scale is about $50/mo when billed annually. Monthly billing is available with M80OFF. There are no per-unit fees.",
    },
    {
      id: "does-gavelhouse-handle-reserve-fund-compliance",
      question: "Does Gavelhouse handle reserve fund compliance?",
      answer:
        "Yes. Gavelhouse keeps reserve and operating money separate. It also keeps the board record easier to review.",
    },
    {
      id: "how-long-does-setup-take",
      question: "How long does setup take?",
      answer:
        "Most boards can start the same day. Add owners, dues, and funds. Then use the board workflow.",
    },
    {
      id: "do-i-need-to-sign-an-annual-contract",
      question: "Do I need to sign an annual contract?",
      answer:
        "No. Month-to-month. Cancel anytime. Use Y80OFF yearly or M80OFF monthly for 80% off your first year.",
    },
    {
      id: "what-size-community-is-gavelhouse-built-for",
      question: "What size community is Gavelhouse built for?",
      answer: "Gavelhouse is for self-managed communities up to 500 homes.",
    },
    {
      id: "can-i-try-gavelhouse-before-paying",
      question: "Can I try Gavelhouse before paying?",
      answer: "Yes. Start the trial and keep the 30-day money-back guarantee.",
    },
  ],
  competitors: [
    {
      id: "payhoa",
      name: "PayHOA",
      pricing: "$49/mo (<=25 units)",
      weakness:
        "No dedicated reserve study module, partial reserve tracking through accounting only",
    },
    {
      id: "hoalife",
      name: "HOALife",
      pricing: "~$45-$95/mo",
      weakness: "Relies on QuickBooks for accounting",
    },
    {
      id: "townsq",
      name: "TownSq",
      pricing: "$90/mo (<=300 units)",
      weakness: "Weak financials, reserve tracking only on Enterprise tier",
    },
    {
      id: "condo-control",
      name: "Condo Control",
      pricing: "~$49/mo + per-unit modules",
      weakness:
        "Condo-focused, partial reserve tracking, no dedicated reserve study module",
    },
    {
      id: "appfolio",
      name: "AppFolio",
      pricing: "$280/mo min + $0.80-$5/unit",
      weakness: "$280/mo minimum, built for mid-to-large management companies",
      setupFee: "$400+",
    },
    {
      id: "buildium",
      name: "Buildium",
      pricing: "$62-$400/mo tiered",
      weakness:
        "Built for professional mgmt cos, 30-50% hidden fees on top of base price",
    },
    {
      id: "cinc",
      name: "CINC Systems",
      pricing: "$250/mo minimum (quote-based)",
      weakness:
        "Enterprise only, quote-based pricing, not for self-managed boards",
    },
    {
      id: "effortless-hoa",
      name: "Effortless HOA",
      pricing: "$3/home/mo",
      weakness: "Limited to small communities",
    },
    {
      id: "moneyminder",
      name: "MoneyMinder",
      pricing: "Low cost",
      weakness: "No violation tracking, very basic",
    },
    {
      id: "easyhoa",
      name: "EasyHOA",
      pricing: "$3/home/mo",
      weakness: "Basic accounting only, no reserve fund compliance",
    },
    {
      id: "clickpay",
      name: "ClickPay",
      pricing: "Contact for pricing",
      weakness:
        "Payment processing only, no HOA management or reserve features",
    },
    {
      id: "vantaca",
      name: "Vantaca",
      pricing: "$300-500+/mo (quote-based)",
      weakness:
        "Enterprise only for professional mgmt cos, not available to self-managed boards",
    },
    {
      id: "runhoa",
      name: "RunHOA",
      pricing: "$399/year flat",
      weakness:
        "Zero reviews on G2/Capterra, no native mobile app, limited third-party validation",
    },
    {
      id: "hoa-express",
      name: "HOA Express",
      pricing: "Free-$79/mo",
      weakness: "Website builder only, no accounting, no reserve fund tracking",
    },
    {
      id: "enumerate",
      name: "Enumerate",
      pricing: "Quote-based",
      weakness:
        "Outdated interface, mixed reviews (3.8/5 Capterra), rebranded from TOPS in 2023",
    },
    {
      id: "vinteum",
      name: "Vinteum",
      pricing: "$0.79-$1.99/unit/mo",
      weakness:
        "No native accounting, relies on QuickBooks integration, no reserve fund tracking",
    },
    {
      id: "doorloop",
      name: "DoorLoop",
      pricing: "Contact for quote",
      weakness:
        "Primarily rental software, HOA features are secondary, per-unit pricing",
    },
  ],
  capabilities: [
    {
      id: "state-specific-compliance-tracking",
      text: "State-specific compliance tracking",
      category: "compliance",
    },
    {
      id: "true-fund-accounting-no-commingling",
      text: "True fund accounting, no commingling",
      category: "compliance",
    },
    {
      id: "board-ready-reporting-audit-packs-and-month-end-close",
      text: "Board-ready reporting, audit packs, and month-end close",
      category: "feature",
    },
    {
      id: "meetings-governance-workflows-and-owner-visibility-in-one-system",
      text: "Meetings, governance workflows, and owner visibility in one system",
      category: "feature",
    },
    {
      id: "flat-pricing-your-board-can-approve-in-one-meeting",
      text: "Flat pricing your board can approve in one meeting",
      category: "roi",
    },
  ],
  capabilitiesById: {
    reserveCompliance: {
      shortAnswer: "Built-in, state-specific",
    },
    fundAccounting: {
      shortAnswer: "True fund isolation",
    },
    ownerPortal: {
      shortAnswer: "Full self-service",
    },
  },
} as const;

export const appHelpSeed = {
  schemaVersion: "2026-05-knowledge-v1",
  domain: "app",
  help: {
    version: "2026-04-help-v1",
    topics: [
      {
        id: "first-day-setup",
        title: "First day setup",
        summary:
          "The safest order for setting up Gavelhouse when your board is new to the product.",
        category: "start",
        audience: "board",
        timeEstimate: "15 minutes",
        relatedRoutes: ["/dashboard", "/settings"],
        sections: [
          {
            heading: "Start with the board basics",
            body: "Before adding financial details, make sure Gavelhouse knows the community name, state, and who on the board should help.",
            steps: [
              "Open Settings.",
              "Confirm the community name and two-letter state code.",
              "Invite the treasurer, secretary, or another board member.",
            ],
          },
          {
            heading: "Use the dashboard checklist",
            body: "The dashboard is your home base. It shows the first important tasks and lets you mark them complete as the board finishes them.",
            steps: [
              "Import the homeowner roster.",
              "Add reserve fund information.",
              "Review compliance requirements.",
              "Create the first dues batch.",
            ],
          },
        ],
        glossaryTerms: ["CSV", "Reserve fund", "Assessment"],
      },
      {
        id: "opening-downloaded-files",
        title: "Opening downloaded files",
        summary:
          "How to find, open, and share PDF, ZIP, and CSV files after Gavelhouse downloads them.",
        category: "files",
        audience: "everyone",
        timeEstimate: "5 minutes",
        relatedRoutes: ["/reports/audit-pack", "/portal"],
        sections: [
          {
            heading: "Where the file went",
            body: "Most browsers put downloaded files in a Downloads folder. If you do not see it, look near the top-right of the browser for a downloads arrow or open File Explorer and choose Downloads.",
          },
          {
            heading: "What to do with each file type",
            body: "PDF files are for reading or printing. ZIP files hold several files in one package. CSV files open in spreadsheet apps like Excel or Google Sheets.",
            steps: [
              "Double-click a PDF to read it.",
              "Double-click a ZIP file, then open the files inside.",
              "Open a CSV with Excel, Numbers, or Google Sheets.",
            ],
          },
        ],
        glossaryTerms: ["PDF", "ZIP", "CSV"],
      },
      {
        id: "homeowner-roster",
        title: "Add homeowners",
        summary:
          "Add or import homeowners so dues, owner portal links, and board records match real people.",
        category: "governance",
        audience: "board",
        timeEstimate: "10 minutes",
        relatedRoutes: ["/governance/homeowners", "/finance/dues"],
        sections: [
          {
            heading: "Why this matters",
            body: "Homeowners are used for dues, owner portal links, architectural requests, and contact records. Add the roster before creating dues if possible.",
          },
          {
            heading: "Import from a spreadsheet",
            body: "Paste CSV text with the column names Gavelhouse shows on the page. Start with a few rows if you are unsure.",
            steps: [
              "Open Homeowner Directory.",
              "Choose Import CSV.",
              "Paste the spreadsheet text.",
              "Review any row errors before moving on.",
            ],
          },
        ],
        glossaryTerms: ["CSV", "Assessment"],
      },
      {
        id: "reserve-study-import",
        title: "Import a reserve study",
        summary:
          "Bring in reserve fund components so the board can understand funding and compliance.",
        category: "finance",
        audience: "board",
        timeEstimate: "10 minutes",
        relatedRoutes: ["/finance/reserves"],
        sections: [
          {
            heading: "What to import",
            body: "A reserve study usually lists major components, useful life, remaining life, replacement cost, and current reserve amount.",
          },
          {
            heading: "If the import fails",
            body: "Gavelhouse will show which row needs attention. Fix the spreadsheet, export it again as CSV, and import again.",
          },
        ],
        glossaryTerms: ["CSV", "Reserve fund"],
      },
      {
        id: "dues-and-assessments",
        title: "Create dues and assessments",
        summary:
          "Create the charges homeowners need to pay and track which ones are still open.",
        category: "finance",
        audience: "board",
        timeEstimate: "8 minutes",
        relatedRoutes: ["/finance/dues"],
        sections: [
          {
            heading: "Before you start",
            body: "Add homeowners first. Then choose the month, amount, fund type, and due date for the assessment batch.",
          },
          {
            heading: "Plain English example",
            body: "If each homeowner owes $150 for May dues, choose May, enter 150.00, pick the operating fund, and choose the due date.",
          },
        ],
        glossaryTerms: ["Assessment"],
      },
      {
        id: "bank-statements",
        title: "Upload bank statements",
        summary:
          "Import bank statement rows so the treasurer can compare the bank to Gavelhouse.",
        category: "finance",
        audience: "board",
        timeEstimate: "10 minutes",
        relatedRoutes: ["/bank/statements", "/bank/reconcile"],
        sections: [
          {
            heading: "What you need",
            body: "Choose the bank account, statement date, beginning balance, ending balance, and a CSV of statement lines.",
          },
          {
            heading: "After uploading",
            body: "Open Reconcile to match statement lines to payments or journal entries. This is how the board confirms the books match the bank.",
          },
        ],
        glossaryTerms: ["CSV", "Reconcile"],
      },
      {
        id: "audit-pack-download",
        title: "Download an audit pack",
        summary:
          "Create a ZIP file of financial reports for board records, an accountant, or an auditor.",
        category: "reports",
        audience: "board",
        timeEstimate: "3 minutes",
        relatedRoutes: ["/reports/audit-pack"],
        sections: [
          {
            heading: "Pick the dates",
            body: "Choose the first and last date you want included. For a yearly board packet, use January 1 through December 31.",
          },
          {
            heading: "Open the download",
            body: "The audit pack downloads as a ZIP file. Open the ZIP, then open the reports inside.",
          },
        ],
        glossaryTerms: ["Audit pack", "ZIP", "PDF"],
      },
      {
        id: "owner-portal",
        title: "Use the owner portal",
        summary:
          "Help homeowners open their portal link and understand what they can see.",
        category: "owner-portal",
        audience: "homeowner",
        timeEstimate: "5 minutes",
        relatedRoutes: ["/portal", "/owner"],
        sections: [
          {
            heading: "Use the link from your board",
            body: "Homeowners do not need the full board dashboard. They use the special portal link sent by the board.",
          },
          {
            heading: "If the link does not work",
            body: "Portal links can expire. Ask your board to send a new link. Do not forward an old link to another homeowner.",
          },
        ],
        glossaryTerms: ["Assessment"],
      },
    ],
    rolePaths: [
      {
        id: "president",
        role: "President",
        summary:
          "Get the board organized, invite the right people, and keep a simple view of what still needs attention.",
        firstSteps: [
          "Confirm the community name and state in Settings.",
          "Invite your treasurer and secretary.",
          "Review the dashboard checklist once a week.",
        ],
        href: "/help?role=president",
      },
      {
        id: "treasurer",
        role: "Treasurer",
        summary:
          "Set up the money side first: accounts, homeowners, dues, reserve study, bank statements, and reports.",
        firstSteps: [
          "Check the chart of accounts before entering money.",
          "Import homeowners so dues can be tied to real people.",
          "Download an audit pack after the first month-end close.",
        ],
        href: "/help?role=treasurer",
      },
      {
        id: "secretary",
        role: "Secretary",
        summary:
          "Use Gavelhouse to keep meetings, requests, violations, and board handoffs easy to find.",
        firstSteps: [
          "Add homeowners or confirm the roster is current.",
          "Create the next board meeting.",
          "Use transitions when a board role changes hands.",
        ],
        href: "/help?role=secretary",
      },
      {
        id: "homeowner",
        role: "Homeowner",
        summary:
          "Use the owner portal link from your board to see balances and architectural requests without a full board login.",
        firstSteps: [
          "Open the link your board sent you.",
          "Review assessments and due dates.",
          "Ask the board for a new link if yours has expired.",
        ],
        href: "/help?role=homeowner",
      },
      {
        id: "plain-language",
        role: "Not comfortable with computers",
        summary:
          "Start with one small task at a time. Gavelhouse will tell you what each page is for and what to do next.",
        firstSteps: [
          "Go one step at a time.",
          "Use the Help button whenever a page feels unfamiliar.",
          "When downloading a file, check your browser Downloads folder.",
          "If a file will not open, ask someone to install a PDF reader or unzip tool.",
        ],
        href: "/help?role=plain-language",
      },
    ],
    pageHelp: [
      {
        id: "dashboard",
        routes: ["/dashboard"],
        title: "Dashboard",
        purpose:
          "This is the board's home base. It shows the next important task so you can move through setup in a simple order.",
        nextStep:
          "Open the first unfinished item and complete it before moving on to the next page.",
        commonMistake:
          "Trying to finish every setup task at once instead of working through the checklist one step at a time.",
        href: "/help/first-day-setup",
      },
      {
        id: "setup",
        routes: ["/setup"],
        title: "Setup",
        purpose:
          "Use Setup to confirm the community name, state, and the first people who should have access to the board tools.",
        nextStep:
          "Check the legal community name and two-letter state code, then invite the right board members.",
        commonMistake:
          "Entering a nickname or a full state name instead of the exact information the board will rely on later.",
        href: "/help/first-day-setup",
      },
      {
        id: "settings",
        routes: ["/settings"],
        title: "Settings",
        purpose:
          "Settings stores the community basics Gavelhouse uses everywhere else, including the board name and board access.",
        nextStep:
          "Verify the community name, state, and board invitations before you start importing records.",
        commonMistake:
          "Leaving the defaults in place and assuming they will be correct for every board member later on.",
        href: "/help/first-day-setup",
      },
      {
        id: "homeowners",
        routes: ["/governance/homeowners"],
        title: "Homeowners",
        purpose:
          "This page keeps the owner roster in one place so dues, portal access, and contact records point to real people.",
        nextStep:
          "Import or add the homeowner list, then check the names, emails, and unit numbers for obvious mistakes.",
        commonMistake:
          "Skipping the roster and trying to create dues before Gavelhouse knows who the assessments belong to.",
        href: "/help/homeowner-roster",
      },
      {
        id: "dues",
        routes: ["/finance/dues"],
        title: "Dues",
        purpose:
          "Use this page to create regular assessments or special charges and keep track of what each homeowner owes.",
        nextStep:
          "Pick the assessment period, amount, and fund type, then review the preview before confirming anything.",
        commonMistake:
          "Creating dues before the homeowner list is ready or choosing the wrong fund type for the charge.",
        href: "/help/dues-and-assessments",
      },
      {
        id: "reserves",
        routes: ["/finance/reserves"],
        title: "Reserves",
        purpose:
          "This page helps the board review reserve study information and understand long-term savings for major repairs.",
        nextStep:
          "Import the reserve study details and check the major components before you depend on the numbers.",
        commonMistake:
          "Treating the reserve study like a one-time upload and not reviewing the dates or replacement amounts carefully.",
        href: "/help/reserve-study-import",
      },
      {
        id: "bank-statements",
        routes: ["/bank/statements"],
        title: "Bank statements",
        purpose:
          "Use this page to bring in bank activity so the treasurer can compare the bank records to Gavelhouse.",
        nextStep:
          "Choose the bank account, statement dates, balances, and statement CSV before uploading the file.",
        commonMistake:
          "Entering the wrong starting or ending balance and then wondering why the reconciliation does not match.",
        href: "/help/bank-statements",
      },
      {
        id: "reconcile",
        routes: ["/bank/reconcile"],
        title: "Reconcile",
        purpose:
          "Reconciliation is where the board checks that Gavelhouse matches the bank statement and explains any differences.",
        nextStep:
          "Match each statement line, review any unmatched items, and only finalize when everything makes sense.",
        commonMistake:
          "Finalizing too early before every bank line has been matched or explained.",
        href: "/help/bank-statements",
      },
      {
        id: "close-the-month",
        routes: ["/close"],
        title: "Close the month",
        purpose:
          "This page helps the board finish the month in a clean order so reports and records are ready to save.",
        nextStep:
          "Review the outstanding items, confirm the reports, and complete the close only when the books are ready.",
        commonMistake:
          "Closing the month before the bank, dues, and reports have been checked by the board.",
        href: "/help/audit-pack-download",
      },
      {
        id: "reports",
        routes: ["/reports"],
        title: "Reports",
        purpose:
          "Reports give the board a readable summary of what happened during the month or year without digging through every record.",
        nextStep:
          "Open the report you need, then choose the date range that matches the board meeting or filing deadline.",
        commonMistake:
          "Using the wrong date range and then sharing a report that does not match the period being discussed.",
        href: "/help/audit-pack-download",
      },
      {
        id: "audit-pack",
        routes: ["/reports/audit-pack"],
        title: "Audit pack",
        purpose:
          "The audit pack bundles the board's reports into one download that is easy to share with the board, accountant, or auditor.",
        nextStep:
          "Choose the date range, download the ZIP file, and open the files inside if you need to review them first.",
        commonMistake:
          "Thinking the download failed when the file actually went to the browser's Downloads folder.",
        href: "/help/audit-pack-download",
      },
      {
        id: "owner-portal",
        routes: ["/portal", "/owner"],
        title: "Owner portal",
        purpose:
          "The owner portal is the simple homeowner view for checking balances, requests, and board-shared information.",
        nextStep:
          "Use the latest portal link from the board and ask for a new link if the old one no longer works.",
        commonMistake:
          "Sharing an expired link or trying to use the full board dashboard instead of the homeowner portal.",
        href: "/help/owner-portal",
      },
    ],
    fieldHelp: [
      {
        id: "community.name",
        label: "Community name",
        body: "Enter the HOA's legal name or the name everyone already recognizes so records, reports, and invitations stay consistent.",
        example: "Maple Ridge HOA",
      },
      {
        id: "community.state",
        label: "State",
        body: "Use the two-letter state code. Gavelhouse uses it to show the right compliance guidance and local settings.",
        example: "TX",
      },
      {
        id: "invite.role",
        label: "Board role",
        body: "Choose the job the person will do on the board so their access and guidance match their responsibilities.",
        example: "Treasurer",
      },
      {
        id: "homeowners.csv",
        label: "Homeowner CSV",
        body: "Upload a spreadsheet-style CSV file with the homeowner roster. Start with a small file first if you want to check the format.",
        example: "owners.csv",
      },
      {
        id: "homeowners.portalLink",
        label: "Portal link",
        body: "Email identifies owner records. Portal links can be emailed from Gavelhouse or copied and shared by the board. Share only the current link and ask for a new one if the old link expires.",
      },
      {
        id: "dues.period",
        label: "Assessment period",
        body: "Choose the month or date range the charge belongs to so homeowners can tell exactly what the bill covers.",
        example: "May 2026",
      },
      {
        id: "dues.amount",
        label: "Assessment amount",
        body: "Enter the amount each homeowner owes before late fees or adjustments so the batch stays easy to review.",
        example: "150.00",
      },
      {
        id: "dues.fundType",
        label: "Fund type",
        body: "Choose operating for regular dues and reserve for long-term savings so the charge lands in the right bucket.",
        example: "Operating",
      },
      {
        id: "bank.beginningBalance",
        label: "Beginning balance",
        body: "Enter the balance shown at the start of the bank statement period so the reconciliation has the right starting point.",
      },
      {
        id: "bank.endingBalance",
        label: "Ending balance",
        body: "Enter the balance shown at the end of the bank statement period so the books can be compared to the bank statement.",
      },
      {
        id: "bank.statementCsv",
        label: "Statement CSV",
        body: "Upload the bank statement file with one row per transaction. If the file came from the bank, keep the format exactly as exported.",
      },
      {
        id: "reconcile.finalize",
        label: "Finalize reconciliation",
        body: "Only finalize after every bank line has been matched or explained so the board can trust the completed month.",
      },
      {
        id: "close.complete",
        label: "Complete close",
        body: "Use this when the month has been reviewed and the board is ready to save the finished reports and records.",
      },
    ],
    glossary: [
      {
        id: "assessment",
        term: "Assessment",
        meaning:
          "A charge the HOA asks homeowners to pay, such as monthly dues or a special one-time charge.",
      },
      {
        id: "audit-pack",
        term: "Audit pack",
        meaning:
          "A downloaded ZIP file that contains board financial reports for a date range.",
      },
      {
        id: "csv",
        term: "CSV",
        meaning:
          "A spreadsheet-style file. You can usually make one from Excel or Google Sheets by choosing Save as CSV.",
      },
      {
        id: "pdf",
        term: "PDF",
        meaning:
          "A document file meant for reading or printing. If it does not open, install a PDF reader or open it in your browser.",
      },
      {
        id: "reserve-fund",
        term: "Reserve fund",
        meaning:
          "Money saved for large future repairs, such as roofs, pavement, gates, elevators, or major equipment.",
      },
      {
        id: "reconcile",
        term: "Reconcile",
        meaning:
          "Compare Gavelhouse records to the bank statement so the board knows the numbers match.",
      },
      {
        id: "zip",
        term: "ZIP",
        meaning:
          "A folder of files packed into one download. Double-click it to open, then open the files inside.",
      },
    ],
  },
} as const;

# Gavelhouse Content Writing Guide

Reference for all content batch agents. Read this before writing any piece.

## Brand Voice (non-negotiable)

- **Audience**: Volunteer HOA board members (treasurers, presidents, secretaries), self-managed communities <=500 units
- **Lead with**: Reserve fund compliance, personal liability protection, state-specific requirements
- **Anti-QuickBooks positioning**: QuickBooks commingles operating and reserve funds. Gavelhouse enforces separation at the DB layer.
- **Never**: Claim HOA/legal/real estate domain expertise -- write from the builder perspective ("we built Gavelhouse because...")
- **Never**: Fabricate testimonials, user counts, review ratings, or waitlist numbers
- **Voice**: Compliance-focused. Boards face fiduciary duty. Use specificity over generalities.
- **No AI slop**: No "in conclusion", "it's important to note", "as we can see", "delve", "it's worth noting", "comprehensive guide", "dive deeper", "game-changer"

## Content Quality Standards

- Every statistic needs a real, checkable URL in `sources` or `statistics`
- Every piece minimum 900 words of substantive content (no padding, no filler)
- Vary sentence lengths: mix short punchy sentences with longer explanatory ones
- Use second person ("your board", "your community", "when you") over third person
- Specific numbers > vague claims: "69% of HOA boards" beats "many boards"
- Lead every guide with a direct answer to the primary keyword question (the BLUF)

## File Locations (all files go in worktree)

Base path: the worktree root (see CLAUDE.md; worktrees live under `.claude/worktrees/`).

- `apps/web/src/content/guides/` -- TOFU educational deep-dives
- `apps/web/src/content/listicles/` -- MOFU "best X for Y" roundups
- `apps/web/src/content/comparisons/` -- MOFU/BOFU vs pages
- `apps/web/src/content/alternatives/` -- "Alternatives to X" pages
- `apps/web/src/content/solutions/` -- BOFU role/use-case pages
- `apps/web/src/content/lead-magnets/` -- Gated PDF landing pages

## URL Patterns for Internal Links

- Guides: `/resources/guides/{slug}/`
- Listicles: `/resources/best/{slug}/`
- Comparisons: `/compare/versus/{slugA}-vs-{slugB}/`
- Alternatives: `/compare/alternatives/{slug}/`
- Solutions: `/solutions/{slug}/`
- Lead magnets (free downloads): `/free/{slug}/`
- Product pages: `/product/{slug}/`
- State pages: `/hoa-compliance/{slug}/`

## Existing Lead Magnets (use these for relatedPages cross-links)

- `/free/reserve-fund-calculator/` -- Reserve fund percent-funded calculator
- `/free/hoa-annual-meeting-planner/` -- 90-day annual meeting planning template
- `/free/hoa-software-evaluation-scorecard/` -- HOA software comparison scorecard
- `/free/hoa-board-transition-checklist/` -- Board member transition checklist
- `/free/hoa-budget-template/` -- Annual budget template
- `/free/reserve-compliance-checklist/` -- Reserve fund compliance checklist
- `/free/50-state-reserve-fund-requirements/` -- State-by-state reserve requirements
- `/free/hoa-board-meeting-agenda-template/` -- Board meeting agenda template
- `/free/reserve-study-rfp-template/` -- Reserve study RFP template
- `/free/hoa-fiduciary-duty-checklist/` -- Fiduciary duty checklist
- `/free/hoa-collections-policy-template/` -- Collections policy template
- `/free/hoa-cybersecurity-checklist/` -- Cybersecurity checklist

## New Lead Magnets Being Created (use for cross-links in later batches)

- `/free/hoa-newsletter-template/` -- HOA newsletter template (Batch 2)
- `/free/hoa-violation-letter-template/` -- Violation letter template (Batch 2)
- `/free/hoa-budget-checklist/` -- Annual budget checklist (Batch 10)
- `/free/hoa-board-onboarding-kit/` -- New board member onboarding kit (Batch 10)
- `/free/hoa-annual-compliance-checklist/` -- Year-round compliance calendar (Batch 10)
- `/free/hoa-ccr-enforcement-checklist/` -- CC&R enforcement checklist (Batch 10)

## Key Existing Guides (use for relatedPages)

- `/resources/guides/hoa-accounting-guide/`
- `/resources/guides/hoa-reserve-fund-compliance-guide/`
- `/resources/guides/hoa-board-liability-guide/`
- `/resources/guides/hoa-fund-accounting-guide/`
- `/resources/guides/hoa-reserve-study-guide/`
- `/resources/guides/hoa-treasurer-annual-checklist/`
- `/resources/guides/hoa-special-assessment-guide/`
- `/resources/guides/hoa-collection-policy-template/`
- `/resources/guides/hoa-meeting-minutes-guide/`
- `/resources/guides/hoa-board-election-procedures/`
- `/resources/guides/hoa-ccr-covenants-guide/`
- `/resources/guides/hoa-violation-enforcement-guide/`
- `/resources/guides/hoa-document-management-guide/`
- `/resources/guides/hoa-financial-reporting-automation/`
- `/resources/guides/hoa-president-role-guide/`
- `/resources/guides/hoa-conflict-of-interest-policy/`
- `/resources/guides/hoa-directors-officers-insurance-guide/`
- `/resources/guides/hoa-lien-foreclosure-process/`
- `/resources/guides/hoa-delinquent-account-procedures/`
- `/resources/guides/self-managed-vs-professional-hoa/`
- `/resources/guides/quickbooks-hoa-limitations/`
- `/resources/guides/how-to-choose-hoa-software/`

## Key Existing Comparisons

- `/compare/versus/gavelhouse-vs-payhoa/`
- `/compare/versus/gavelhouse-vs-quickbooks/`
- `/compare/versus/gavelhouse-vs-hoalife/`
- `/compare/versus/gavelhouse-vs-moneyminder/`
- `/compare/versus/gavelhouse-vs-condo-control/`

## Key Existing Solutions

- `/solutions/hoa-treasurer-software/`
- `/solutions/hoa-board-president-software/`
- `/solutions/hoa-board-secretary-software/`
- `/solutions/condo-board-software/`
- `/solutions/small-self-managed-hoa-software/`

## Key Existing Listicles

- `/resources/best/best-hoa-accounting-software/`
- `/resources/best/best-hoa-management-software-2026/`
- `/resources/best/best-hoa-software-for-self-managed-communities/`
- `/resources/best/best-reserve-study-software-2026/`

## Pricing (always accurate, never fabricated)

Gavelhouse pricing with Y80OFF: Starter $10/mo, Growth $27/mo, Scale $50/mo, and Portfolio custom when billed annually. No per-unit fees. Use Y80OFF yearly or M80OFF monthly for 80% off the first year. 30-day money-back guarantee.

---

## GUIDE Schema (guides/ collection)

```yaml
---
title: "TITLE HERE"
description: "Meta description max 160 chars. Include primary keyword."
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: tofu # tofu | mofu | bofu
primaryKeyword: exact keyword from research
searchIntent: informational # informational | commercial | transactional | navigational
schema: Article # Article | FAQPage | HowTo | Product | ItemList
ctaMode: educate # educate | evaluate | convert
bluf: >-
  Direct answer to the primary keyword question. Max 50 words. No fluff.
tags:
  - tag1
  - tag2
targetPersona:
  - board-treasurer # board-treasurer | board-president | board-secretary | property-manager
relatedPages:
  - /resources/guides/existing-guide/
  - /resources/guides/another-guide/
  - /free/relevant-lead-magnet/
sources:
  - title: "Source Title"
    source: "Organization Name"
    url: "https://real-verified-url.org/actual-page"
    lastChecked: "2026-04-29"
statistics:
  - stat: "Verified statistic with specific number"
    source: "Organization"
    sourceUrl: "https://real-url.org"
definitions:
  - term: "Key Term"
    definition: "Clear definition relevant to HOA boards"
answers:
  - question: "Question that someone searching this topic would ask"
    answer: "Direct, specific answer"
faqs:
  - q: "FAQ question"
    a: "FAQ answer (2-4 sentences)"
---
```

## LISTICLE Schema (listicles/ collection)

```yaml
---
title: "Best X for Y in 2026"
description: "Meta description"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: mofu
primaryKeyword: "keyword"
searchIntent: commercial
schema: ItemList
ctaMode: evaluate
bluf: "Direct summary of what makes these tools different"
category: "HOA Software"
qualifier: "best"
tags:
  - comparison
relatedPages:
  - /path/to/page/
sources:
  - title: "source"
    source: "org"
    url: "https://url"
    lastChecked: "2026-04-29"
statistics: []
definitions: []
answers:
  - question: "Q"
    answer: "A"
faqs:
  - q: "Q"
    a: "A"
tools:
  - name: "Gavelhouse"
    summary: "Best for reserve compliance and fund accounting enforcement"
    pros:
      - "Enforces operating/reserve fund separation at DB layer"
      - "State-specific reserve requirement tracking"
      - "Flat pricing, no per-unit fees"
    cons:
      - "Newer product, smaller feature breadth than enterprise tools"
    pricing: "From $10/mo billed annually with Y80OFF"
    verdict: "Best choice for self-managed communities where reserve compliance is the priority"
tableData:
  name: "Comparison Table"
  columns:
    - "Tool"
    - "Starting Price"
    - "Fund Accounting"
    - "Best For"
  rows:
    - [
        "Gavelhouse",
        "$10/mo billed annually with Y80OFF",
        "Yes -- enforced",
        "Reserve compliance",
      ]
---
```

## COMPARISON Schema (comparisons/ collection)

```yaml
---
title: "Tool A vs Tool B: What Self-Managed HOAs Need to Know"
description: "Meta description"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: bofu
primaryKeyword: "keyword"
searchIntent: commercial
schema: Article
ctaMode: convert
bluf: "Direct 1-2 sentence comparison summary"
tags:
  - comparison
targetPersona:
  - board-treasurer
relatedPages:
  - /path/
sources:
  - title: "source"
    source: "org"
    url: "https://url"
    lastChecked: "2026-04-29"
statistics: []
answers:
  - question: "Q"
    answer: "A"
faqs:
  - q: "Q"
    a: "A"
competitorA:
  name: "Tool A"
  slug: "tool-a"
  pricing: "From $X/mo"
  pros:
    - "Pro 1"
  cons:
    - "Con 1"
competitorB:
  name: "Gavelhouse"
  slug: "gavelhouse"
  pricing: "From $10/mo billed annually with Y80OFF (Starter <=50 homes)"
  pros:
    - "Fund-level operating/reserve separation enforced at database layer"
    - "State-specific reserve compliance tracking"
    - "Flat pricing, no per-unit fees"
  cons:
    - "Newer product, narrower feature breadth"
verdict: "Who should choose which and why"
tableData:
  name: "Comparison"
  columns: ["Feature", "Tool A", "Gavelhouse"]
  rows:
    - ["Fund accounting", "No", "Yes -- enforced at DB layer"]
---
```

## ALTERNATIVE Schema (alternatives/ collection)

```yaml
---
title: "Best Alternatives to Tool X for Self-Managed HOAs"
description: "Meta description"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: bofu
primaryKeyword: "keyword"
searchIntent: commercial
schema: ItemList
ctaMode: convert
bluf: "Direct 1-2 sentence summary"
tags:
  - alternatives
relatedPages:
  - /path/
sources:
  - title: "source"
    source: "org"
    url: "https://url"
    lastChecked: "2026-04-29"
statistics: []
answers:
  - question: "Q"
    answer: "A"
faqs:
  - q: "Q"
    a: "A"
competitor:
  name: "Tool X"
  slug: "tool-x"
  pricing: "From $X/mo"
  weakness: "Main reason boards look for alternatives"
  pros:
    - "Pro 1"
  cons:
    - "Con 1 that drives people to search for alternatives"
pros:
  - "Reason why Gavelhouse is a good alternative"
cons:
  - "Honest limitation"
tableData:
  name: "Alternatives Comparison"
  columns: ["Tool", "Starting Price", "Fund Accounting", "Best For"]
  rows:
    - [
        "Gavelhouse",
        "$10/mo billed annually with Y80OFF",
        "Yes",
        "Reserve compliance",
      ]
---
```

## SOLUTION Schema (solutions/ collection)

```yaml
---
title: "HOA X Software for Y"
description: "Meta description"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: bofu
primaryKeyword: "keyword"
searchIntent: commercial
schema: SoftwareApplication
ctaMode: convert
bluf: "What Gavelhouse solves for this audience"
solutionCategory: role # role | segment | migration
audienceLabel: "HOA treasurers"
painPoints:
  - "Pain point 1"
  - "Pain point 2"
  - "Pain point 3"
outcomes:
  - "Outcome 1"
  - "Outcome 2"
  - "Outcome 3"
relatedProductSlugs:
  - hoa-fund-accounting-software
  - hoa-financial-reporting-software
tags:
  - solution
relatedPages:
  - /path/
sources:
  - title: "source"
    source: "org"
    url: "https://url"
    lastChecked: "2026-04-29"
statistics: []
answers:
  - question: "Q"
    answer: "A"
faqs:
  - q: "Q"
    a: "A"
---
```

## LEAD MAGNET Schema (lead-magnets/ collection)

```yaml
---
title: "Downloadable Asset Title"
description: "Meta description (also shown in download cards)"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
reviewedAt: "2026-04-29"
buyerStage: tofu
primaryKeyword: "keyword"
searchIntent: informational
schema: Article
bluf: "What this download gives the user and who it is for. Max 50 words."
freePreviewSections: 2
tags:
  - template
  - checklist
relatedPages:
  - /resources/guides/related-guide/
  - /resources/best/related-listicle/
sources:
  - title: "source"
    source: "org"
    url: "https://url"
    lastChecked: "2026-04-29"
definitions:
  - term: "Key Term"
    definition: "Definition"
answers:
  - question: "What does this resource include?"
    answer: "Specific answer about the template/checklist contents"
faqs:
  - q: "FAQ question"
    a: "FAQ answer"
---
```

## Real Sources to Cite (verified, always accurate)

Use these for credibility. Include the actual URL.

- CAI (Community Associations Institute): https://www.caionline.org/
- Fannie Mae HOA Guidelines: https://selling-guide.fanniemae.com/sel/b4-2.3-04/
- Freddie Mac Condo/PUD Guidelines: https://guide.freddiemac.com/app/guide/chapter/5701
- IRS Form 1120-H: https://www.irs.gov/forms-pubs/about-form-1120-h
- Surfside Condo Collapse (NIST): https://www.nist.gov/topics/disaster-failure-studies/champlain-towers-south-collapse
- Florida HB 1021 (2023 HOA reform): https://www.flsenate.gov/Session/Bill/2023/1021
- Florida SB 154 (2022 condo safety): https://www.flsenate.gov/Session/Bill/2022/154
- Davis-Stirling Act (CA): https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=5550.
- Nevada NRS 116: https://www.leg.state.nv.us/NRS/NRS-116.html
- Colorado HB24-1233: https://leg.colorado.gov/bills/hb24-1233
- CAI Statistics: https://www.caionline.org/AboutCommunityAssociations/Pages/StatisticsandData.aspx

## Useful Statistics (verified)

- 74 million Americans live in HOA-governed communities (CAI, 2024)
- 365,000+ HOAs in the US (CAI, 2024)
- ~80% of new construction communities are HOA-governed
- Average HOA board member serves 2-4 year terms as an unpaid volunteer
- Fannie Mae requires 10%+ of gross assessments go to reserves for warrantable condo projects
- HOA reserve studies typically cost $3,000-$8,000 professionally
- Communities below 30% funded face significant special assessment risk

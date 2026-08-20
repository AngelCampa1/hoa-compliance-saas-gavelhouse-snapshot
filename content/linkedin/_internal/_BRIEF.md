# Gavelhouse LinkedIn Post Source-of-Truth Brief

This file is the single source of truth for all 285 LinkedIn posts.
Every factual claim in every post MUST trace to a section below.
If a fact is not in this brief, it does not go in a post.

---

## BRAND FACTS

- **Name:** Gavelhouse
- **Domain:** gavelhouse.app
- **Signup URL:** https://my.gavelhouse.app/signup
- **Contact email:** angel.campa@gavelhouse.app
- **Founder:** Angel Campa
- **Legal entity:** Angel Campa
- **Tagline:** "Is Your HOA Reserve Fund Actually Compliant?"
- **Twitter:** @gavelhouse
- **Category:** HOA Community Association Management
- **Description:** Gavelhouse is a compliance-first HOA board operating system for self-managed communities. Financial control, governance workflows, owner operations, and Y80OFF annual plans from about $10/mo billed annually without per-unit fees.
- **Target audience:** Self-managed volunteer HOA and condo boards that need one compliance-first system for finance, governance, and owner operations in communities up to 500 units.

Source: `packages/shared/src/knowledge/index.ts` KNOWLEDGE_BRAND, `packages/shared/src/knowledge/seed-data.ts` lines 1-13

---

## PRICING (annual billing default)

| Plan      | Size                   | Annual price       | Monthly price      |
| --------- | ---------------------- | ------------------ | ------------------ |
| Starter   | Up to 50 homes         | $10/mo billed annually with Y80OFF  | $12/mo with M80OFF |
| Growth    | 51-200 homes           | $27/mo billed annually with Y80OFF  | $33/mo with M80OFF |
| Scale     | 201-500 homes          | $50/mo billed annually with Y80OFF  | $60/mo with M80OFF |
| Portfolio | 500+ / Multi-community | Custom                           | Custom             |

- Display range: "about $10-$50/mo billed annually with Y80OFF"
- No per-unit fees on any plan
- Month-to-month, cancel anytime
- 30-day money-back guarantee
- Y80OFF code: 80% off your first year on yearly plans
- M80OFF code: 80% off your first year on monthly plans
- $0 setup fee

Source: `packages/shared/src/knowledge/seed-data.ts` lines 79-197, `packages/shared/src/brand.ts` FAQS lines 396-421

---

## PLAN FEATURES

### Starter ($10/mo billed annually with Y80OFF, up to 50 homes)

- Reserve/operating fund enforced separation (CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364)
- Reserve-study deadline tracking for your state's statute
- Dues tracking and online payments with receipts on record
- Core homeowner directory and governance records
- Up to 3 board users

### Growth ($27/mo billed annually with Y80OFF, 51-200 homes)

- Everything in Starter plus:
- Governance records with full audit trail on owner requests
- Owner portal with request visibility and audit-trail (FL Section 720.303(5), CA Section 4525)
- Automated dues reminders and delinquency tracking
- Up to 10 board users

### Scale ($50/mo billed annually with Y80OFF, 201-500 homes)

- Everything in Growth plus:
- General ledger and core financial reports
- Audit-packet exports formatted for CA/FL/WA statutory review
- Month-end close workflow with attested balances
- Unlimited board users, priority support

### Portfolio (custom pricing, 500+ / multi-community)

- Everything in Scale plus:
- Portfolio rollups across communities
- Portfolio-wide compliance oversight
- Cross-community reserve health dashboard
- Dedicated account manager, custom integrations, enterprise SLA

Source: `packages/shared/src/knowledge/seed-data.ts` lines 83-186

---

## TRUST SIGNALS (exact text only)

1. "State-specific compliance tracking" (category: compliance)
2. "True fund accounting, no commingling" (category: compliance)
3. "Board-ready reporting, audit packs, and month-end close" (category: feature)
4. "Meetings, governance workflows, and owner visibility in one system" (category: feature)
5. "Flat pricing your board can approve in one meeting" (category: roi)

Source: `packages/shared/src/knowledge/seed-data.ts` lines 21-42

---

## PROBLEM AGITATION STATS (exact quotes - do not paraphrase numbers)

1. "Over 100,000 self-managed HOAs still run on spreadsheets and QuickBooks."
2. "58% of boards that made the switch cited finances as the trigger." (context: switching to professional management companies)
3. "Financial complexity is the #1 reason volunteer boards hire professional management companies."
4. Florida banned reserve waivers for structural components.
5. "New Jersey requires baseline funding that never drops below zero."
6. "Fannie Mae is raising its reserve floor to 15% on January 4, 2027 (Lender Letter LL-2026-03)."

Source: `packages/shared/src/brand.ts` PROBLEM_AGITATION lines 693-702

---

## BOARDING STACK HONEST CONS (from gavelhouse-as-competitor.ts)

- Newer product with less third-party audit history than established platforms
- No native mobile app yet; web interface works on mobile browsers
- Purpose-built for self-managed boards, not for professional management companies managing many communities

Source: `packages/shared/src/marketing/gavelhouse-as-competitor.ts` lines 39-43

---

## COMPETITOR DATA (use exact pricing/weakness strings only)

1. **PayHOA:** $49/mo (<=25 units) | Weakness: No dedicated reserve study module, partial reserve tracking through accounting only
2. **HOALife:** ~$45-$95/mo | Weakness: Relies on QuickBooks for accounting
3. **TownSq:** $90/mo (<=300 units) | Weakness: Weak financials, reserve tracking only on Enterprise tier
4. **Condo Control:** ~$49/mo + per-unit modules | Weakness: Condo-focused, partial reserve tracking, no dedicated reserve study module
5. **AppFolio:** $280/mo min + $0.80-$5/unit + $400+ setup fee | Weakness: $280/mo minimum, built for mid-to-large management companies
6. **Buildium:** $62-$400/mo tiered | Weakness: Built for professional mgmt cos, 30-50% hidden fees on top of base price
7. **CINC Systems:** $250/mo minimum (quote-based) | Weakness: Enterprise only, quote-based pricing, not for self-managed boards
8. **Effortless HOA:** $3/home/mo | Weakness: Limited to small communities
9. **MoneyMinder:** Low cost | Weakness: No violation tracking, very basic
10. **EasyHOA:** $3/home/mo | Weakness: Basic accounting only, no reserve fund compliance
11. **ClickPay:** Contact for pricing | Weakness: Payment processing only, no HOA management or reserve features
12. **Vantaca:** $300-500+/mo (quote-based) | Weakness: Enterprise only for professional mgmt cos, not available to self-managed boards
13. **RunHOA:** $399/year flat | Weakness: Zero reviews on G2/Capterra, no native mobile app, limited third-party validation
14. **HOA Express:** Free-$79/mo | Weakness: Website builder only, no accounting, no reserve fund tracking
15. **Enumerate:** Quote-based | Weakness: Outdated interface, mixed reviews (3.8/5 Capterra), rebranded from TOPS in 2023
16. **Vinteum:** $0.79-$1.99/unit/mo | Weakness: No native accounting, relies on QuickBooks integration, no reserve fund tracking
17. **DoorLoop:** Contact for quote | Weakness: Primarily rental software, HOA features are secondary, per-unit pricing

Source: `packages/shared/src/brand.ts` COMPETITORS lines 211-324

---

## LEAD MAGNET

- **Title:** "50-State HOA Reserve Fund Requirements Guide"
- **Description:** "Every state's reserve study and funding requirements in one reference. Statutes, deadlines, penalties, and the Fannie Mae changes taking effect January 4, 2027."
- **Slug:** 50-state-reserve-fund-requirements
- **URL:** gavelhouse.app/free/ (or the specific resource page)

Source: `packages/shared/src/brand.ts` LEAD_MAGNET lines 717-722

---

## FANNIE MAE 2027 RULE

- Lender Letter: LL-2026-03
- Effective date: January 4, 2027
- Requirement: 15% reserve allocation for Full Review loan applications
- Applies to: ALL associations regardless of state law
- Impact: Underfunded associations could block homeowner mortgage approvals

Source: `packages/shared/src/compliance/states.ts` lines 18-24 (header comment)

---

## STATE COMPLIANCE DATA (all 50 states + DC)

### MANDATE STATES (reserve study required by statute)

**California (CA)**

- Statute: Davis-Stirling Act (Civil Code Section 5550-5560)
- Study frequency: every 3 years
- Commingling: PROHIBITED - CA Civ. Code Section 5510 explicitly prohibits commingling of reserve and operating funds
- Penalties: $100-$500/day
- Notes: Visual inspection annually; full study every 3 years. Must disclose percent-funded status annually with 30-year funding plan. SB 900 (2024), AB 2114 (2024), SB 410 (2025)

**Colorado (CO)**

- Statute: Colorado Common Interest Ownership Act Section 38-33.3-209.5
- Study frequency: every 5 years (recommended; required above assessment threshold)
- Must disclose reserve balance and percent-funded status

**Delaware (DE)**

- Statute: Delaware Uniform Common Interest Ownership Act Section 81-318
- Study frequency: at least every 5 years
- Must include a funding plan

**Florida (FL)**

- Statute: Chapter 718 (condos) / Chapter 720 (HOAs)
- Study frequency: every 10 years (SIRS structural components)
- Commingling: PROHIBITED - FL Stat. Section 720.303(6)(a) (HOA) and Section 718.111(14) (condo) prohibit commingling of reserve and operating funds
- Penalties: $5,000/violation
- Notes: SIRS every 10 years for condos/co-ops 3+ stories; milestone inspections at 30 years (25 near coast). Reserve waiver BANNED for SIRS structural components. SB 4-D (2022), HB 913 (2025). Most comprehensive post-Surfside reforms.

**Hawaii (HI)**

- Statute: HRS Section 514B-148
- Minimum funding: 50% funded required (Act 296, 2025)
- Notes: 30-year horizon under Act 296. Act 62 (2022)

**Maryland (MD)**

- Statute: Maryland Homeowners Association Act Section 11B-112
- Commingling: PROHIBITED - MD Code, Real Prop. Section 11-109.1 requires separate reserve accounts
- Penalties: $10,000 fines (highest explicit monetary penalty of any state)
- Notes: Mandatory baseline funding under HB 292 (2025). HB 107 (2022)

**Nevada (NV)**

- Statute: NRS Section 116.31152
- Study frequency: every 5 years

**Oregon (OR)**

- Statute: ORS Section 100.175
- Study frequency: every 3-5 years
- Must include a funding plan

**Tennessee (TN)**

- Statute: Tennessee Community Association Act
- Study required but funding levels not mandated
- Notes: SB 863 (2023). Weakest post-Surfside reform.

**Utah (UT)**

- Statute: Utah Community Association Act Section 57-8a
- Study frequency: at least every 6 years
- Must disclose reserve balance

**Virginia (VA)**

- Statute: Virginia Property Owners' Association Act Section 55.1-1826
- Study frequency: at least every 5 years
- Must include component analysis and funding plan
- Notes: HB 1209 (2024)

**Washington (WA)**

- Statute: RCW Section 64.34.382 (condos) / Section 64.90 (common interest)
- Study frequency: at least every 3 years
- Commingling: PROHIBITED - RCW 64.34.364 requires separate reserve accounts
- Notes: Must include a 30-year funding plan

### DISCLOSURE STATES (reserve disclosures required, formal study not mandated)

**Connecticut (CT)**

- Statute: Common Interest Ownership Act Section 47-261
- Must disclose reserve fund balance in annual financial reports
- SB 212 pending to mandate studies

**Illinois (IL)**

- Statute: Condo Property Act (765 ILCS 605)
- Must disclose reserve fund status; no formal study required
- HB 2563 / SB 1703 pending

**New Jersey (NJ)**

- Statute: Condominium Act (N.J.S.A. 46:8B)
- Commingling: PROHIBITED - N.J.S.A. 46:8B-19 requires separate accounts
- Notes: Balance can NEVER drop below $0. S2760 (2024), S3992 (2025) established baseline funding rules

**New York (NY)**

- Statute: Real Property Law / General Business Law
- Must disclose reserve fund information in offering plans and annual reports
- S7600 / A8945 pending

**Pennsylvania (PA)**

- Statute: Uniform Planned Community Act (68 Pa.C.S. Section 5304)
- Must include reserve information in public offering statement

### PERMISSIVE STATES (reserves authorized/encouraged but not mandated)

AZ, GA, MA, MI, MN, MO, NC, SC, TX

- No mandate, no required study
- Fiduciary duty is the primary enforcement mechanism
- Fannie Mae LL-2026-03 (15% floor, Jan 4, 2027) still applies

### SILENT STATES (no specific reserve provisions)

AL, AK, AR, DC, ID, IN, IA, KS, KY, LA, ME, MS, MT, NE, NH, NM, ND, OH, OK, RI, SD, VT, WV, WI, WY

- General fiduciary duty applies
- Fannie Mae LL-2026-03 (15% floor, Jan 4, 2027) still applies

Source: `packages/shared/src/compliance/states.ts` lines 1-591

---

## VOICE RULES (NON-NEGOTIABLE)

### Zero-fabrication invariant

- Every stat, dollar penalty, statute citation, deadline, and competitor claim must trace to this brief
- No invented testimonials, customer counts, waitlist numbers, growth metrics, "boards I've worked with"
- If a number is not above, it does not go in a post

### Voice

- Lead with compliance/liability/fiduciary duty - not emotion, not FOMO
- Builder perspective: "we built Gavelhouse because..." - never "as an HOA expert" or "with 20 years in property management"
- Anti-QuickBooks: commingling is the core failure mode; FL/NJ/MD have explicit statutory prohibitions
- Plain, direct; sentence-length varied; occasionally one-line for impact
- Conversational where the topic allows; statutory where it demands precision

### FORBIDDEN words/phrases (hard ban)

- Em dashes: - (U+2014), - (U+2013 en dash in body copy), - (ASCII double hyphen)
- "It's worth noting" / "Worth noting"
- "In today's fast-paced world" / "today's landscape"
- "In conclusion" / "To summarize"
- "Let's dive in" / "dive into"
- "navigate" (as metaphor for managing complexity)
- "leverage" (as a verb meaning "use")
- "delve" / "delving"
- "tapestry" / "landscape" (as metaphor) / "realm" / "journey" (as metaphor)
- "robust" / "seamless" / "cutting-edge" (as filler adjectives)
- "not just X but Y" (negative parallelism as crutch)
- "game-changer" / "game-changing"
- "In the realm of" / "In the world of"
- "It is important to note"
- "At the end of the day"
- "Moving forward"
- "Ensure" used pompously when "check" or "make sure" will do
- "Utilize" when "use" will do

### Style

- 0 to 3 hashtags max per post
- 120 to 220 words per post (shorter fine for high-impact statutory fact posts, max ~100 words)
- Open with a hook: a statute, a dollar penalty, a specific deadline, or a concrete question
- End with either a soft CTA (link to gavelhouse.app resource) or no CTA (engagement-only)
- No hashtag spam

---

## SCHEDULE

All posts channel: company (Gavelhouse company LinkedIn page)

Workday slots (15 posts): 06:30, 07:00, 07:30, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 20:00 (America/Chicago / CDT = UTC-5)
Weekend slots (10 posts): 07:00, 08:00, 09:30, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 20:00

| Day | Type    | Posts | Date       |
| --- | ------- | ----- | ---------- |
| Tue | Workday | 15    | 2026-05-12 |
| Wed | Workday | 15    | 2026-05-13 |
| Thu | Workday | 15    | 2026-05-14 |
| Fri | Workday | 15    | 2026-05-15 |
| Sat | Weekend | 10    | 2026-05-16 |
| Sun | Weekend | 10    | 2026-05-17 |
| Mon | Workday | 15    | 2026-05-18 |
| Tue | Workday | 15    | 2026-05-19 |
| Wed | Workday | 15    | 2026-05-20 |
| Thu | Workday | 15    | 2026-05-21 |
| Fri | Workday | 15    | 2026-05-22 |
| Sat | Weekend | 10    | 2026-05-23 |
| Sun | Weekend | 10    | 2026-05-24 |
| Mon | Workday | 15    | 2026-05-25 |
| Tue | Workday | 15    | 2026-05-26 |
| Wed | Workday | 15    | 2026-05-27 |
| Thu | Workday | 15    | 2026-05-28 |
| Fri | Workday | 15    | 2026-05-29 |
| Sat | Weekend | 10    | 2026-05-30 |
| Sun | Weekend | 10    | 2026-05-31 |
| Mon | Workday | 15    | 2026-06-01 |

TOTAL: 285

---

## FRONTMATTER FORMAT (every post)

```text
---
id: YYYY-MM-DD-dow-NN
scheduledAt: YYYY-MM-DDTHH:MM:00-05:00
channel: company
pillar: state-compliance|reserve-mechanics|anti-quickbooks|competitor-commentary|board-liability|builder-pov|board-ops|lead-magnet|fannie-mae|faq
state: XX   # 2-letter code, omit if not state-specific
tags: [tag1, tag2]
hook: "one-line hook phrase"
---
```

File naming: `YYYY-MM-DD-dow-NN-slug.md`
Example: `2026-05-12-tue-01-fl-reserve-waiver-ban.md`

---

## PILLAR ASSIGNMENTS BY DATE RANGE

W1 (Tue 5/12 - Sun 5/17, 80 posts):

- Heavy: state-compliance (CA, FL, MD, WA, NJ commingling states)
- Medium: reserve-mechanics, anti-quickbooks

W2 (Mon 5/18 - Thu 5/21, 60 posts):

- Heavy: competitor-commentary, board-liability
- Medium: builder-pov

W3 (Fri 5/22 - Sun 5/24, 35 posts):

- Heavy: board-ops, lead-magnet

W4 (Mon 5/25 - Thu 5/28, 60 posts):

- Heavy: state-compliance (mandate states: CO, DE, HI, NV, OR, TN, UT, VA)
- Medium: reserve-mechanics

W5 (Fri 5/29 - Sun 5/31, 35 posts):

- Heavy: fannie-mae (Fannie Mae 2027 countdown)
- Medium: faq

W6 (Mon 6/1, 15 posts):

- Mix of all pillars, promotional close, Y80OFF promo

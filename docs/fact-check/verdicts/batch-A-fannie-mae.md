# Batch A — Fannie Mae LL-2026-03 verdicts

Last checked: 2026-05-11

## Authoritative sources used

- **Primary (Fannie Mae's own letter, PDF):** https://singlefamily.fanniemae.com/media/44986/display
  - WebFetch returned 403 directly (Fannie Mae blocks the PDF endpoint from this tool), but the document is the cited PDF in every secondary source.
- **Fannie Mae news page (canonical landing):** https://singlefamily.fanniemae.com/news-events/lender-letter-ll-2026-03-updates-project-standards-property-insurance-requirements
- **Secondary independent confirmation:** https://www.bcpmortgage.com/post/fannie-mae-condo-guidelines-2026
- **Secondary independent confirmation:** https://governingdocs.dev/blog/fannie-freddie-condo-rules-2026/

## Established facts (will be used as ground truth for corrections)

| Claim | Verified value | Notes |
|---|---|---|
| Letter exists | Yes — LL-2026-03 | Issued March 18, 2026 |
| Title | "Updates to Project Standards & Property Insurance Requirements" | |
| Old reserve % | 10% | Pre-existing minimum |
| New reserve % | 15% | Of annual budgeted assessment income, for **capital expenditures and deferred maintenance** (not total reserves) |
| 15% effective date | January 4, 2027 | Applies to Full Review loan applications dated on or after this date |
| Applies to | Full Review files | Limited Review files exit via separate path |
| Limited Review retirement | August 3, 2026 | For established condo projects |
| Small-project waiver | New/established condo projects with ≤10 units | Have alternative waiver path |
| Baseline funding method | Prohibited under LL-2026-03 | Lenders may not use it |

## Verdicts by claim category

### "Lender Letter LL-2026-03" — CONFIRMED
Appears in dozens of posts. Verbatim use of identifier matches the source exactly.

### "15% reserve allocation floor / 15% threshold" — CONFIRMED (with nuance)
The 15% applies specifically to **capital expenditures and deferred maintenance line items as a percentage of annual budgeted assessment income**, not to total reserve balance or "percent funded" of a reserve study. Posts that say "15% reserve allocation floor for Full Review loan applications" are accurate. Posts that say "15% reserve floor" are slightly loose but defensible — keep as-is, do not soften.

### "January 4, 2027" effective date — CONFIRMED
Date matches LL-2026-03 exactly. Math also checks: May 12, 2026 → Jan 4, 2027 = 237 days, validating the "237 days away" claim in `2026-05-12-tue-06`.

### "Full Review" — CONFIRMED
Posts that reference Full Review questionnaires and the Full Review process are accurate.

### "Limited Review retired August 3, 2026" — CONFIRMED
Matches LL-2026-03. One small precision: it's retired for **established** condo projects; small projects (≤10 units) have a waiver path. Posts in this batch do not contradict this — they all describe the Aug 3 2026 date correctly.

### "Currently 10%, rising to 15%" — CONFIRMED
Appears in the 50-state lead magnet. Correct.

### "Applies to every association in every state, regardless of state law" — CONFIRMED
Lender Letter applies federally to all loans Fannie Mae purchases. Texas/Arizona/Georgia posts citing this are correct.

## Per-post action items

All 82 posts that reference Fannie Mae are factually consistent with LL-2026-03. **No contradicted claims found.** The work in Phase 3 is purely additive: append `sources:` frontmatter pointing to the canonical Fannie Mae URL.

### Standard sources block to append to every Fannie-Mae-referencing post

```yaml
sources:
  - title: Lender Letter LL-2026-03 — Updates to Project Standards & Property Insurance Requirements
    source: Fannie Mae
    url: https://singlefamily.fanniemae.com/news-events/lender-letter-ll-2026-03-updates-project-standards-property-insurance-requirements
    lastChecked: 2026-05-11
```

For posts that specifically reference the Limited Review retirement, also include:
```yaml
  - title: LL-2026-03 PDF (issued March 18, 2026)
    source: Fannie Mae
    url: https://singlefamily.fanniemae.com/media/44986/display
    lastChecked: 2026-05-11
```

## Live-post impact

13 of the 82 Fannie-Mae-touching posts are already `*.uploaded.json`. Since all claims are CONFIRMED, no live-post edits are required for Batch A. `output/fact-check/live-post-edits.md` will be empty for this batch.

## Posts in scope (82 total)

Filter: `grep -l "Fannie Mae\|LL-2026-03\|January 4, 2027\|15% reserve\|Limited Review\|Full Review" content/linkedin/posts/*.md`

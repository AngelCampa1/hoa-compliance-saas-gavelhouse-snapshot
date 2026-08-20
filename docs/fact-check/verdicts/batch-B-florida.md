# Batch B — Florida verdicts

Last checked: 2026-05-11

## Authoritative sources used

- **FL §718.111(14)** (2024 + 2025 statute text): https://www.flsenate.gov/laws/statutes/2024/718.111 and https://m.flsenate.gov/statutes/718.111
- **FL §720.303** (2025 statute text): https://www.flsenate.gov/laws/statutes/2025/720.303
- **HB 913 (2025) bill summary**: https://www.flsenate.gov/Committees/BillSummaries/2025/html/913
- **SB 4-D (2022) enrolled text**: https://www.flsenate.gov/Session/Bill/2022D/4D/BillText/er/PDF
- **DBPR penalties** (§718.501(1)(d)(6) + F.A.C. Chapter 61B-21): https://ablawfl.com/dbprs-condominium-division-increases-disciplinary-civil-penalties-against-associations/ (independent legal commentary; primary is the F.A.C.)

## Verdicts

### ✅ HB 913 (2025) — "Florida banned the reserve waiver for structural components" — CONFIRMED
HB 913 was signed by Gov. DeSantis, effective **July 1, 2025**. Structural reserves can no longer be waived (with limited 2-year pause option for urgent repairs after milestone inspection). Posts: `2026-05-12-tue-01`, `2026-05-20-wed-13`, `2026-05-28-thu-05`, `2026-06-01-mon-01`, `2026-05-25-mon-10`.

### ✅ SB 4-D (2022) — milestone inspections at 30 years (25 near coast) — CONFIRMED
Signed by Gov. DeSantis May 26, 2022. Buildings 3+ stories; 30 years (or 25 if within 3 miles of coast). Recurring every 10 years. Posts: `2026-05-13-wed-03`, `2026-05-15-fri-04`.

### ✅ SIRS every 10 years for 3+ story condos — CONFIRMED
Originated in SB 4-D, refined by HB 913. Applies to condos and cooperatives 3+ stories.

### 🚨 CONTRADICTED — "FL Stat. §720.303(6)(a) (HOAs) and §718.111(14) (condos) prohibit commingling"
This appears in posts `2026-05-12-tue-01`, `2026-05-14-thu-05`, `2026-05-18-mon-05`, `2026-05-27-wed-02`, and in the source-of-truth files (`states.ts` line 69, lead-magnet).

**What the statutes actually say:**
- **§718.111(14)** (condos): "For investment purposes only, reserve funds **may be commingled** with operating funds of the association. Commingled operating and reserve funds shall be accounted for separately, and a commingled account shall not, at any time, be less than the amount identified as reserve funds." Manager/agent commingling with personal/other-association funds is prohibited (separately).
- **§720.303** (HOAs): Pre-turnover, "reserve and operating funds of the association shall not be commingled... except the association may jointly invest reserve funds; however, such jointly invested funds must be accounted for separately." Developer commingling with personal/other-HOA funds is prohibited. §720.303(6) itself is about owners electing to fully fund reserves, NOT about commingling.

**Correction:** Replace "prohibit commingling" with "require **separate accounting** of reserve and operating funds; commingling for joint investment is permitted only with separate accounting." Drop the bare "§720.303(6)(a)" citation for HOA commingling — it's the wrong subsection; the correct citation for the HOA separate-accounting rule lives elsewhere in §720.303 (pre-turnover protection) and is not cleanly anchored to one subsection. Use "§720.303 (separate-accounting requirement)" without the subsection.

### 🚨 CONTRADICTED — "Both [§720.303 and §718.111] carry a $5,000 per-violation penalty"
The $5,000 figure is real but comes from a different authority.

**What's actually true:**
- The DBPR's Division of Condominiums, Timeshares, and Mobile Homes can fine up to **$5,000 per violation** under **§718.501(1)(d)(6)** and **F.A.C. Chapter 61B-21**.
- This authority covers condominiums and cooperatives only. **HOAs in Florida are not under DBPR jurisdiction at the same level** — HOA enforcement is primarily via civil action by members, not DBPR fines. So the "$5,000/violation" claim does not cleanly apply to HOA boards.

**Correction:** Reframe as "Florida's DBPR Division of Condominiums can fine condos and co-ops up to $5,000 per violation under §718.501(1)(d)(6) and F.A.C. 61B-21." Remove the "applies to HOAs" framing in posts that conflate the two chapters.

### ✅ "Florida moved comprehensively after Surfside" / "most comprehensive post-Surfside reforms" — CONFIRMED (defensible)
Florida passed SB 4-D (2022), SB 154 (2023), HB 913 (2025), and the milestone-inspection framework. No other state has matched this volume in the same timeframe. Defensible superlative; keep as-is.

## Per-post action items

### Add `sources:` frontmatter to all 11 FL posts

```yaml
sources:
  - title: FL HB 913 (2025) — Bill Summary
    source: Florida Senate
    url: https://www.flsenate.gov/Committees/BillSummaries/2025/html/913
    lastChecked: 2026-05-11
  - title: FL SB 4-D (2022) — Enrolled text
    source: Florida Senate
    url: https://www.flsenate.gov/Session/Bill/2022D/4D/BillText/er/PDF
    lastChecked: 2026-05-11
  - title: FL Stat. §718.111 (condos)
    source: Florida Statutes
    url: https://m.flsenate.gov/statutes/718.111
    lastChecked: 2026-05-11
  - title: FL Stat. §720.303 (HOAs)
    source: Florida Statutes
    url: https://m.flsenate.gov/statutes/720.303
    lastChecked: 2026-05-11
```

### Body rewrites required

| Post | Wrong line | Replacement |
|---|---|---|
| `2026-05-12-tue-01-fl-reserve-waiver-ban.md` | "FL Stat. §720.303(6)(a) (HOAs) and §718.111(14) (condos) also prohibit commingling reserve and operating funds. The fine is $5,000 per violation, and each commingled transaction can be counted separately." | "FL Stat. §718.111(14) requires condo reserves and operating funds to be accounted for separately. FL Stat. §720.303 requires the same for HOAs. The DBPR Division of Condominiums can fine condos and co-ops up to $5,000 per violation for improper handling under §718.501(1)(d)(6) and Florida Admin Code Chapter 61B-21." |
| `2026-05-14-thu-05-fl-commingling-5000-fine.md` (line 11–13) | "$5,000 per violation. That is the Florida fine for commingling reserve and operating funds. FL Stat. §720.303(6)(a) governs HOAs. FL Stat. §718.111(14) governs condos. Both prohibit commingling. Both carry a $5,000 per-violation penalty." | "$5,000 per violation. That is the maximum DBPR fine on Florida condo and co-op boards for improperly handling reserve and operating funds. The fine is set under §718.501(1)(d)(6) and Florida Administrative Code Chapter 61B-21. The DBPR's jurisdiction covers condos and cooperatives; Florida HOAs operate under §720.303, which requires the same separate accounting but is enforced through member civil action rather than DBPR fines." |
| `2026-05-18-mon-05-fl-commingling-5000.md` | Likely same pattern — read and rewrite. | Same shape as above. |
| `2026-05-27-wed-02-fl-commingling-5000-penalty.md` | Likely same pattern — read and rewrite. | Same shape as above. |
| `2026-05-16-sat-03-fl-hoa-vs-condo-law.md` | Probably contains the conflation — read and rewrite. | Same shape. |

## Live-post impact

8 of the 11 FL posts are already uploaded to LinkedIn (based on `*.uploaded.json` files in git status). The contradicted posts (`2026-05-14-thu-05`, `2026-05-18-mon-05`, `2026-05-12-tue-01`) are among those already public. These need entries in `output/fact-check/live-post-edits.md`.

## Internal source-of-truth corrections

### `packages/shared/src/compliance/states.ts` (FL entry, lines 60-70)

Current `notes`:
> "...$5,000/violation. SB 4-D (2022), HB 913 (2025). Most comprehensive post-Surfside reforms. FL Stat. §720.303(6)(a) (HOA) and §718.111(14) (condo) prohibit commingling of reserve and operating funds."

Replace with:
> "...$5,000/violation (DBPR fine under §718.501(1)(d)(6) + F.A.C. 61B-21; applies to condos and co-ops, not HOAs). SB 4-D (2022), HB 913 (2025). Most comprehensive post-Surfside reforms. §718.111(14) requires separate accounting of condo reserves and operating funds (commingling permitted only for joint investment with separate accounting). §720.303 requires the same for HOAs."

### `apps/web/src/content/lead-magnets/50-state-reserve-fund-requirements.md`

Replace the Florida section's commingling/penalty paragraph with the same corrected text. Add primary-source URLs (Florida statutes + bills) to the `sources:` frontmatter.

# Batch C — Maryland verdicts

Last checked: 2026-05-11

## Sources used

- **HB 292 (2025) — Chapter 519**: https://mgaleg.maryland.gov/2025RS/chapters_noln/Ch_519_hb0292E.pdf and https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/hb0292?ys=2025rs
- **HB 107 (2022) — Chapter 664**: https://mgaleg.maryland.gov/2022RS/Chapters_noln/CH_664_hb0107e.pdf
- **§11-109.1 (Md Real Prop)** — text via Justia: https://law.justia.com/codes/maryland/real-property/title-11/section-11-109-1/
- **§11B-112.2 (Md Real Prop)** — annual budget / reserves: https://law.justia.com/codes/maryland/real-property/title-11b/section-11b-112-2/
- **MD smartproperty / cowielaw secondary commentary** for AG enforcement framing

## Verdicts

### ✅ HB 107 (2022) — reserve study mandate — CONFIRMED
Effective October 1, 2022 (Chapter 664). Required reserve studies by October 1, 2023.

### ✅ HB 292 (2025) — mandatory funding — CONFIRMED
Chapter 519, signed by Gov. Wes Moore 05/13/2025, effective **October 1, 2025**. Shifts Maryland from disclosure to mandatory funding — associations must adopt a funding plan and deposit recommended reserve contributions into the reserve account by the end of each fiscal year. Amends **§11B-112.2** and adds funding-plan requirements via §11B-112.3.

### 🚨 CONTRADICTED — "$10,000 per violation" / "highest reserve penalty of any state"
This is a fabrication. Multiple errors layered:

1. **Wrong statute cited.** Maryland Real Property §11-109.1 is about **"Closed Meetings of the Board of Directors"** — when boards can hold sessions out of public view. It has nothing to do with commingling, reserves, or penalties.
2. **No statutory "$10,000 per violation" reserve-fund penalty exists.** Secondary commentary references a $10K Maryland Attorney General Consumer Protection Division enforcement maximum for broader Condo Act violations, but that's an AG action ceiling — not a per-violation reserve-fund penalty under any specific section.
3. **"Highest reserve fund penalty of any state" is unverifiable.** California's $100–500/day fine can exceed $10,000 within weeks. Florida's $5,000/violation DBPR fine can stack. The superlative is not supportable.

Appears in posts: `2026-05-12-tue-07`, `2026-05-14-thu-08`, `2026-05-18-mon-02`, `2026-05-21-thu-09`, `2026-05-26-tue-12`, `2026-06-01-mon-03`. All 6 MD posts need rewriting.

### 🚨 CONTRADICTED — "§11-109.1 requires separate reserve accounts"
§11-109.1 (Closed Meetings of the Board) has no requirement of separate reserve accounts. The Maryland Condominium Act's reserve-related sections are **§11-109.4** (reserve study) and §11-110 (assessments). Maryland HOA reserve sections are §11B-112.2 (budget/reserves) and §11B-112.3 (reserve study). Posts citing §11-109.1 for any reserve-account or commingling requirement are factually wrong.

### ⚠️ "Reserve balance cannot be zeroed out" / "baseline funding rules" — PARTIAL
HB 292 (2025) requires associations to fund reserves per the latest reserve study's recommended schedule. It does not contain an absolute "balance can never reach zero" provision (that framing is closer to New Jersey's S2760/S3992 — separate batch). Soften the framing in MD posts.

## Per-post corrections

### Standard sources block to add to all 6 MD posts

```yaml
sources:
  - title: MD HB 292 (2025) — Chapter 519
    source: Maryland General Assembly
    url: https://mgaleg.maryland.gov/2025RS/chapters_noln/Ch_519_hb0292E.pdf
    lastChecked: 2026-05-11
  - title: MD HB 107 (2022) — Chapter 664
    source: Maryland General Assembly
    url: https://mgaleg.maryland.gov/2022RS/Chapters_noln/CH_664_hb0107e.pdf
    lastChecked: 2026-05-11
  - title: Md. Real Prop. §11B-112.2 — Annual Budget (reserves)
    source: Maryland Real Property Code
    url: https://law.justia.com/codes/maryland/real-property/title-11b/section-11b-112-2/
    lastChecked: 2026-05-11
```

### Body rewrites — replace "$10K/violation/§11-109.1" framing with verified HB 292 framing

Across all 6 posts: remove "highest penalty of any state", "$10,000 per violation", and any "§11-109.1" / "§11B-112" framing. Replace with the verified mandatory-funding story under HB 292 + §11B-112.2/§11B-112.3, citing AG enforcement authority generically (without a specific dollar figure).

## Internal source-of-truth correction

### `packages/shared/src/compliance/states.ts` MD entry (lines 82–92)

Current (wrong):
> "Mandatory baseline funding under HB 292 (2025). $10,000 fines -- highest explicit monetary penalty of any state. HB 107 (2022). MD Code, Real Prop. §11-109.1 requires separate reserve accounts; commingling prohibited."

Replace with:
> "HB 107 (2022, Chapter 664) mandated reserve studies; HB 292 (2025, Chapter 519, effective Oct 1, 2025) added mandatory funding — associations must adopt a funding plan and deposit reserve contributions per the most recent reserve study by fiscal year-end. Reserve provisions live in §11B-112.2 (annual budget) and §11B-112.3 (reserve study) for HOAs; §11-109.4 governs condo reserve studies. Enforcement is via the Maryland AG Consumer Protection Division under the Maryland Condominium Act and HOA Act."

### `apps/web/src/content/lead-magnets/50-state-reserve-fund-requirements.md` MD section

Replace similar penalty/superlative language with the corrected framing above. Add primary-source URLs to `sources:` frontmatter.

## Live-post impact

3 of 6 MD posts are already uploaded (verify via `.uploaded.json`). Add live-post-edits.md rows for each contradicted live post.

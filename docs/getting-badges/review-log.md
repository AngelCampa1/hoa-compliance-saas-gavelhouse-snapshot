# Review Log

## Requirement Verification

Verified on 2026-05-15.

| Platform | Result |
| --- | --- |
| SaaSHub | Requirements re-checked from `https://www.saashub.com/services/submit`. Package includes URL, categories, competitors, domain-email verification TODO, and rejection checklist. |
| Product Hunt | Requirements re-checked from `https://www.producthunt.com/launch/preparing-for-launch`. Package includes direct URL, Product Hunt field limits, 240x240 thumbnail, 1270x760 gallery assets, first comment, and video TODO. |
| G2 | Requirements re-checked from G2 categorization and product information docs. Package avoids beta/waitlist language, keeps name clean, includes category evidence, and maps G2 logo/banner specs. |
| BetaList | Requirements re-checked from BetaList criteria and support. Package uses recently launched positioning with a submit-time confirmation note and documents acceptance/queue risks. |
| AlternativeTo | Public pages re-checked. Package treats it as account/contribution based and includes app metadata, alternatives, features, screenshots, and duplicate-check instructions. |

## Humanizer Pass

Status: passed.

Edits applied:

- Used specific HOA board language instead of generic SaaS claims.
- Kept the founder-direct tone without overclaiming.
- Removed unsupported credibility claims such as review counts, customer counts,
  awards, rankings, and founded year.
- Varied the long descriptions by platform to avoid duplicate directory copy.
- Avoided legal-advice claims and kept Gavelhouse framed as an operating tool.

## Field Limit Checks

- Product Hunt tagline: `HOA reserve compliance for volunteer boards`
  - Length: 43 characters.
  - Limit: 60 characters.
- Product Hunt description length: 307 characters.
  - Limit: 500 characters.
- Product Hunt gallery assets:
  - `assets/product-hunt/01-dashboard-1270x760.png`
  - `assets/product-hunt/02-reserve-funds-1270x760.png`
  - `assets/product-hunt/03-governance-1270x760.png`
  - `assets/product-hunt/04-reports-1270x760.png`
  - `assets/product-hunt/05-billing-1270x760.png`
  - Expected dimensions: 1270x760 each.
- Product Hunt thumbnail:
  - `assets/logos/gavelhouse-icon-240.png`
  - Expected dimensions: 240x240.
- G2 profile logo:
  - `assets/logos/gavelhouse-icon-400.png`
  - Expected dimensions: 400x400.
- G2 profile banner:
  - `assets/g2-banner-1260x240.png`
  - Expected dimensions: 1260x240.
- G2 profile banner fallback:
  - `assets/g2-banner-2500x476.png`
  - Expected dimensions: 2500x476.

## Reviewer Findings

Dedicated review agent status: completed.

Findings to fix:

- Medium: G2 banner pointed at the 1200x630 OG image instead of G2's
  1260x240 banner size. Fixed by generating `assets/g2-banner-1260x240.png`
  and `assets/g2-banner-2500x476.png`, then updating G2 docs and inventory.
- Medium: README called the folder fully copy-paste ready while account-only
  fields still require operator confirmation. Fixed by describing it as a
  submission package with explicit account-only TODOs.
- Low: G2 alpha/beta rejection wording was stronger than the currently
  reachable G2 sources support. Fixed by softening the language to the
  practical eligibility decision: submit as recently launched and available,
  not waitlist/private beta.
- High: general screenshot asset references were ignored by the repo's broad
  `screenshots/` ignore rule. Fixed by force-adding the five referenced
  screenshots.
- Medium: Product Hunt promo fields require an expiration date if any promo is
  used. Fixed by moving `Y80OFF` to an optional note and warning not to submit
  a promo without a real expiration date.
- Medium: G2 fallback category pointed toward professional association
  management, not HOA/community associations. Fixed by removing the fallback
  category and using `Community Association Management Software` as the primary
  category.
- Medium: G2 category evidence could overclaim maintenance requests. Fixed by
  adding an explicit caveat not to claim maintenance-request workflows unless
  current product evidence is added first.
- Medium: BetaList recently launched framing can go stale. Fixed by adding
  submit-time confirmation notes.
- Medium: "defensible" and "audit-ready" wording overreached. Fixed by using
  "organized," "board-ready," and "audit packet exports."
- Low: SaaSHub and AlternativeTo categories were too broad. Fixed by removing
  weak generic categories and focusing on community association, accounting,
  reporting, records, board management, and owner portal language.

## Final Acceptance Checklist

- [x] Docs live under `docs/getting-badges/`.
- [x] Platform-specific copy exists for SaaSHub, AlternativeTo, Product Hunt,
  G2, and BetaList.
- [x] Copy variants are not duplicates.
- [x] Generated assets are inside `docs/getting-badges/assets/`.
- [x] Account-only fields are marked as TODO instead of fabricated.
- [x] No secrets are included.
- [x] No app, API, marketing runtime, or shared code files were changed.
- [x] Dedicated review agent completed.
- [x] Review findings fixed.
- [x] Verification commands completed.

## Verification Commands

- `pnpm install --offline` - completed in the worktree so repo scripts could
  find `turbo`.
- `pnpm run lint` - passed.
- Product Hunt field-length script - passed: tagline 43 characters,
  description 307 characters.
- Asset dimension check with `file` - passed for 240x240 thumbnail, 400x400
  G2 logo, 1024x1024 square logo, five 1270x760 Product Hunt gallery images,
  1260x240 G2 banner, and 2500x476 G2 fallback banner.
- Local asset reference check - passed: all `assets/...` references in package
  markdown resolve to files in this folder.
- ASCII check - passed for package markdown files.

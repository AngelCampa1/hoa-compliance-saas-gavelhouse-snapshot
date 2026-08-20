# apps/web Defect Inventory (deep, replacing lite-agent result)

> Generated 2026-05-28 by deep-audit subagent (gpt-5.5-level). Read-only audit.
> Previous lite-agent output ("0 defects") was implausible and is replaced here.

## Summary

| Severity | Count |
| --- | ---: |
| CRITICAL | 4 |
| HIGH | 9 |
| MED | 12 |
| LOW | 7 |
| **Total** | **32** |

Top finding categories:
- **Pill-button rule violation is site-wide.** The marketing primary button (`.btn-primary`) defaults to `--radius-md` (14px), not pill. Every theme preset in `generate-theme-css.ts` ships `--radius-md` for `primaryButtonRadius`, so every `<a class="btn-primary">` / `<button class="btn-primary">` across 21 components is non-compliant with the CLAUDE.md "buttons are pills" UI Standard.
- **CSP blocks Cloudflare Turnstile.** `public/_headers` `script-src` and `frame-src` do not list `https://challenges.cloudflare.com`. Turnstile is injected by `turnstile-widget.tsx` and used by every public lead-magnet/email-capture form; in production CSP will refuse the script and the iframe → all forms are broken.
- **Broken internal links from `/compare/`.** Three of six "versus" links point to slugs that don't match any `comparisons/*.md` file → 404 in production.
- **Trust pages noindex'd.** `privacy`, `terms`, `dpa`, `subprocessors` are all `noindex={true}`. These are the exact pages buyers and SEO crawlers expect to be indexable for trust signals.
- **Stale offer wording in `CLAUDE.md`** still describes the pre-Y80OFF trial model, while live `pages/free/index.astro` correctly uses the Y80OFF + 30-day money-back framing enforced by the pricing audit. CLAUDE.md is the file that needs updating, not the page.

## Findings

### CRITICAL

- [CRITICAL] **CSP missing `challenges.cloudflare.com` for Turnstile script**: `apps/web/public/_headers:9`: `script-src` lists only `'self'`, Cloudflare Insights, and PostHog. Turnstile is loaded from `https://challenges.cloudflare.com/turnstile/v0/api.js` (`apps/web/src/components/turnstile-widget.tsx:31`). In production every lead-magnet/email-capture submit will fail because the bot-protection script is CSP-blocked. **Fix:** add `https://challenges.cloudflare.com` to `script-src`.
- [CRITICAL] **CSP missing `challenges.cloudflare.com` for Turnstile frame**: `apps/web/public/_headers:9`: `frame-src` is `'self' https://www.youtube.com https://player.vimeo.com`. Turnstile renders a challenge iframe from `challenges.cloudflare.com`. Iframe will be refused → users can't complete CAPTCHA → no leads. **Fix:** add `https://challenges.cloudflare.com` to `frame-src`.
- [CRITICAL] **Site-wide pill-button rule violation via `.btn-primary` radius**: `apps/web/src/styles/globals.css:1261` (`border-radius: var(--primary-button-radius);`) + `apps/web/src/styles/globals.css:257` (`--primary-button-radius: var(--site-primary-button-radius, var(--radius-md));`) + `apps/web/src/lib/generate-theme-css.ts:653,665,675` (all theme presets set `primaryButtonRadius: "var(--radius-md)"` or `calc(var(--radius-md) + 2px)`). 21 components (`exit-intent-popup.tsx:567`, `gated-content.tsx:280`, `lead-magnet-capture.tsx`, `email-capture.tsx`, `fake-door-pricing.tsx:1168`, `sidebar-cta.astro:60`, `public-signup-cta.tsx:25`, `inline-signup.astro`, `funnel-cta.astro`, `decision-cta-card.astro`, `faq-section.astro`, `sticky-mobile-cta.astro`, `post-signup-survey.tsx`, `pricebook-builder.tsx`, `referral-share.tsx`, `software-cost-calculator.tsx`, `public-signup-cta.astro`, plus `cro-tracker.ts`) ship rounded-md buttons that violate the canonical "buttons are pills" rule from CLAUDE.md > UI Standards. **Fix:** flip `primaryButtonRadius` to `var(--radius-full)` in every preset of `generate-theme-css.ts` (and the fallback at `globals.css:257`).
- [CRITICAL] **Broken `/compare/` versus links: 404s in production**: `apps/web/src/pages/compare/index.astro:7-14`:
  - `quickbooks-vs-gavelhouse/`: actual file is `gavelhouse-vs-quickbooks.md` → expected slug `/compare/versus/gavelhouse-vs-quickbooks/`.
  - `payhoa-vs-gavelhouse/`: file exists (`payhoa-vs-gavelhouse.md`) but per `[slugA]-vs-[slugB].astro:24-28`, the URL slugs come from `competitorA.slug` / `competitorB.slug` frontmatter, not the filename: needs verification per-entry; expected slug from filename naming convention is `/compare/versus/gavelhouse-vs-payhoa/` (matching the canonical pattern).
  - `cinc-systems-vs-gavelhouse/`: actual file is `cinc-vs-gavelhouse.md`.
  - `buildium-vs-gavelhouse/`: actual file is `buildium-hoa-vs-gavelhouse.md`.
  - `Gavelhouse vs AppFolio` points to `/compare/alternatives/appfolio/` (an alternatives page, not a versus page): inconsistent with the four other entries that point to `/compare/versus/...`.
  - `Gavelhouse vs Excel` points to `/resources/guides/hoa-accounting-guide/`: also not a versus page; misleading anchor text. **Fix:** point each entry to the slug that `getStaticPaths()` actually produces from `competitorA.slug`/`competitorB.slug` frontmatter, and either build a real `gavelhouse-vs-excel` comparison or drop the row.

### HIGH

- [HIGH] **Trust pages noindex'd, blocked from SEO**: `privacy.astro:15`, `terms.astro:15`, `dpa.astro:15`, `subprocessors.astro:58`: all set `noindex={true}`. These pages should be indexable for trust signals, knowledge-graph completeness, and inbound `(privacy policy, terms of service)` SERP queries. **Fix:** remove `noindex` from all four pages (and add canonical URLs with trailing slash for consistency: see MED finding below).
- [HIGH] **`og:type` defaults to "article" for every page**: `apps/web/src/seo/meta-tags.astro:41`: `ogType = "article"` as default; only `pages/free/index.astro` overrides it to `"website"`. Homepage, pricing, contact, about, compare hub, features, resources hub, help index, 404, privacy, terms, dpa, subprocessors all emit `og:type=article`: wrong for non-blog pages; degrades OpenGraph parsing in LinkedIn/Slack/Facebook. **Fix:** change default to `"website"` and explicitly set `"article"` only inside `article-layout.astro` / `lead-magnet-page.astro`.
- [HIGH] **Stale hard-coded resource counts on `/resources/`**: `apps/web/src/pages/resources/index.astro:7-15`: chips show "All 62 / Guides 24 / Best-of 12 / Free templates 9 / State pages 7 / Hubs 6 / Comparisons 4". Actual content collections contain 17 lead-magnets, 46 comparisons; numbers are unrelated to filesystem reality and will continue to drift. **Fix:** compute counts from `getCollection()` at build time.
- [HIGH] **`pages/unsubscribed.astro` reads `Astro.url.searchParams` under `output: "static"`**: `unsubscribed.astro:8` reads `?error=invalid` at build time. With `astro.config.mjs:33 output: "static"`, there is no per-request URL: the `isInvalid` branch is dead at compile time. **Fix:** either move this page to a server endpoint, or render the error UI on the client via a `<script>` reading `window.location.search`.
- [HIGH] **`CLAUDE.md` offer line is stale post-migration**: `apps/web/src/pages/free/index.astro:138` correctly reads `"evaluate Gavelhouse with a 30-day money-back guarantee"`, matching the Y80OFF model enforced by `gavelhouse-pricing-content-audit.test.ts`. `CLAUDE.md:64` still carries the retired pre-migration trial wording, and `CLAUDE.md:63` still lists the retired flat-tier prices. **Fix:** update `CLAUDE.md:63-64` to reference the canonical pricing/offer source in `@boardstack/shared` (KNOWLEDGE_PRICING_PLANS + KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO + GUARANTEE_CONFIG) so the project overview matches the enforced pricing contract and live copy.
- [HIGH] **Footer is missing DPA + Subprocessors links**: `apps/web/src/components/site-footer.astro:52-57`: default Legal group lists only Privacy + Terms. DPA (`/dpa/`) and Subprocessors (`/subprocessors/`) pages exist but are unreachable from the footer. Buyers running vendor reviews expect these in the footer. The lite-agent inventory's claim that the footer links to `/dpa/` and `/subprocessors/` is incorrect. **Fix:** add `{ label: "DPA", href: "/dpa/" }` and `{ label: "Subprocessors", href: "/subprocessors/" }` to the default Legal group.
- [HIGH] **Footer email is wrapped in `<a href="/contact/">` instead of `mailto:`**: `apps/web/src/components/site-footer.astro:92`: visible text is `angel.campa@gavelhouse.app` but the link target is `/contact/`. Users will copy/click expecting an email composer. **Fix:** `<a href={`mailto:${contactEmail}`}>{contactEmail}</a>`.
- [HIGH] **`PublicSignupCta` React island hydrates with `client:load` despite zero state**: `apps/web/src/components/public-signup-cta.tsx:10-30` is a pure render of `<a class="btn-primary">` with no `useState`/`useEffect`/handlers. Mounted with `client:load` on `pages/free/index.astro:140`, hub pages, and `pages/about.astro`. Wastes JS payload + hydration. **Fix:** replace usage with the existing `public-signup-cta.astro` (already in the repo), or drop `client:load` and accept it remaining a server-rendered anchor with no island wrapper.
- [HIGH] **Pricing-page billing-cycle toggle is not pill-shaped**: `apps/web/src/pages/pricing.astro:366-396`: `.billing-toggle { border-radius: 8px }` container + `.billing-toggle button { border-radius: 5px }`. CLAUDE.md > UI Standards lists "toggle groups" explicitly as a button surface that must be `rounded-full`. **Fix:** change both radii to `9999px` (or apply pill via `var(--radius-full)`).

### MED

- [MED] **Conflicting SLA claims (24h vs same-day)**: `apps/web/src/pages/about.astro:91-92` claims "Every bug gets fixed within 24 hours of being reported"; `pages/contact.astro:42` claims "SLA: Same day". Two different commitments on adjacent pages; copy these against each other and standardize on one. **Fix:** pick one (recommend dropping the unverifiable 24-hour bug-fix guarantee: it is a hard promise to keep).
- [MED] **`canonicalUrl` strings inconsistently use trailing slash before normalization**: `pages/privacy.astro:12`, `terms.astro:12`, `dpa.astro:12`, `unsubscribed.astro:15`, `subprocessors.astro`: all pass `https://${siteConfig.domain}/privacy` without trailing slash. `BaseLayout` calls `ensureTrailingSlash` at line 66 so the rendered canonical IS correct, but `astro.config.mjs:34 trailingSlash: "always"` means callers should pass canonical with trailing slash for clarity. Inconsistent with `pages/free/index.astro`, `compare/index.astro` etc. **Fix:** add trailing slash to all `canonicalUrl` string-literals.
- [MED] **`lib/sentry-client.test.ts` test fixtures still use "boardstack" release name**: `apps/web/src/lib/sentry-client.test.ts:106,108,113,121`: release strings like `"boardstack-web@abc123"` and `initSentry("boardstack")` in test fixtures. Internal package names are allowed per CLAUDE.md, but these test fixtures double as the runtime release identifier passed to Sentry. Audit whether the actual prod build sets `PUBLIC_SENTRY_RELEASE=gavelhouse-web@...` or whether the package-name-driven default leaks `boardstack-web@...` into Sentry dashboards. **Fix:** verify prod build env explicitly sets the release with the `gavelhouse-web@` prefix; update test fixtures to match.
- [MED] **Pricing page limited-offer hydration silently falls back on error**: `apps/web/src/pages/pricing.astro:355-357`: `catch { /* Silently fall back to SSG Phase 1 content */ }`. If the limited-offer endpoint goes down or returns a malformed shape, users see static SSG-time content with no signal. Sentry capture would be appropriate. **Fix:** `captureException(err)` before silently falling back.
- [MED] **`/help/` and `/resources/` chips/cards are styled like buttons (rounded-md) but are `<a>`**: `pages/help/index.astro:57`, `pages/resources/index.astro` (chip list): these are visually buttons (rounded boxed CTA cards). Per CLAUDE.md cards are exempt, but the "filter chips" idiom (Resources hub) probably qualifies as a toggle/pill control. **Fix:** audit and either treat as a card-link (current radius OK) or convert to pill chips.
- [MED] **`/compare/index.astro` "Gavelhouse vs AppFolio" + "Gavelhouse vs Excel" are not real versus comparisons**: `pages/compare/index.astro:13,10`: under the "§ 1 · Versus" eyebrow, links go to `/compare/alternatives/appfolio/` and `/resources/guides/hoa-accounting-guide/`. Misleading IA. **Fix:** move both rows out of the Versus section into the appropriate Alternatives or Guides section, or build the actual versus comparisons.
- [MED] **Lead-magnet count fabricated**: `apps/web/src/pages/resources/index.astro:11` claims "Free templates 9". Actual `content/lead-magnets/` directory has 17 entries. **Fix:** compute from `getCollection("lead-magnets")`.
- [MED] **Comparison count fabricated**: `apps/web/src/pages/resources/index.astro:14` claims "Comparisons 4". Actual `content/comparisons/` directory has 46 entries. **Fix:** compute from `getCollection("comparisons")`.
- [MED] **Header nav has no "Help" link despite `/help/` existing**: `apps/web/src/components/site-header.astro:23-30`: nav lists Features, Pricing, Compare, Resources, HOA compliance, About. No Help link, even though the page exists at `/help/` and the footer doesn't link to it either → page is orphaned in the IA. **Fix:** add Help to footer Resources group or to the main nav.
- [MED] **`/help/` referenced nowhere from header or footer**: same finding as above; the page exists but is unreachable from primary nav (only via direct URL or sitemap). SEO-discoverable but UX-orphaned.
- [MED] **`isLimitedOfferActive()` check is server-time, then rendered statically**: `apps/web/src/layouts/base-layout.astro:13,174`: gates the promo bar at build time. If the limited offer expires while users are on cached pages, the bar still shows until the next build/deploy. Acceptable for SSG but worth a build-time cron or KV-driven gate. **Fix:** consider moving the promo gate to a client-side check fed by `/billing/limited-offer` (which already hydrates pricing prices).
- [MED] **Inline `<script>` blocks inside `base-layout.astro` increase XSS surface**: `apps/web/src/layouts/base-layout.astro:118-140`: five inline `<script is:inline set:html={...}>` blocks plus two `<script>` import blocks. CSP `script-src 'unsafe-inline' 'unsafe-eval'` is required for these: relaxing CSP weakens the security posture across the site. **Fix:** consider moving each bootstrap script to a hashed/nonced external `<script src>` so CSP can drop `'unsafe-inline'`.

### LOW

- [LOW] **Promo banner uses `rounded-md` on the code badge**: `apps/web/src/components/promo-banner.astro:31`: `<span class="... rounded-md ...">{trimmedCode}</span>`. The element is a non-interactive badge: per CLAUDE.md rule cards/badges keep their radii, so this is technically allowed, but visually inconsistent with the sibling `rounded-full` "Limited time" pill on line 24. **Fix:** unify to `rounded-full` for visual consistency.
- [LOW] **`base-layout.astro` `<style set:html>` blocks render before CSP nonces are computed**: same area as the CSP MED finding. Style-src already allows `'unsafe-inline'` so no immediate breakage.
- [LOW] **`siteConfig.contactEmail` rendered in footer only when prop passed**: `apps/web/src/components/site-footer.astro:60-92`: `contactEmail` is an optional prop, defaulted from siteConfig elsewhere; if a future caller forgets to pass it, the email line disappears silently. **Fix:** import siteConfig directly in the footer or default the prop from a sensible source.
- [LOW] **Footer "© year siteName" lacks a separator**: `apps/web/src/components/site-footer.astro:118`: `© {currentYear} {siteName}` renders as e.g. `© 2026 Gavelhouse` (acceptable), but the adjacent `<span>gavelhouse.app</span>` is bare: visually two unrelated lines. Minor polish.
- [LOW] **Image lazy-loading not centrally enforced**: Audit didn't find any explicit `<img>` tags without `loading="lazy"` in `pages/*.astro` (the `<OptimizedImage>` wrapper handles this), but ad-hoc inline `<img>` could regress. **Fix:** add an ESLint rule enforcing `loading` attribute on raw `<img>` tags.
- [LOW] **`pages/index.astro` exhibits-card uses `<pre>` with raw filenames for "audit pack manifest"**: `pages/index.astro:137-140`: quirky but intentional design; ensure long filenames don't overflow on mobile. Cosmetic.
- [LOW] **`pages/404.astro` links omit `/about/` and `/help/`**: `pages/404.astro:7-13`: a 404 page is the natural place to send a confused user to the help center. **Fix:** add an entry for Help.

## Files audited

- `apps/web/src/layouts/base-layout.astro`
- `apps/web/src/layouts/landing-layout.astro` (referenced; not edited)
- `apps/web/src/seo/meta-tags.astro`
- `apps/web/src/pages/index.astro`
- `apps/web/src/pages/pricing.astro`
- `apps/web/src/pages/about.astro`
- `apps/web/src/pages/contact.astro`
- `apps/web/src/pages/privacy.astro`
- `apps/web/src/pages/terms.astro`
- `apps/web/src/pages/dpa.astro`
- `apps/web/src/pages/subprocessors.astro`
- `apps/web/src/pages/unsubscribed.astro`
- `apps/web/src/pages/404.astro`
- `apps/web/src/pages/compare/index.astro`
- `apps/web/src/pages/compare/versus/[slugA]-vs-[slugB].astro`
- `apps/web/src/pages/free/index.astro`
- `apps/web/src/pages/free/[slug].astro`
- `apps/web/src/pages/help/index.astro`
- `apps/web/src/pages/resources/index.astro`
- `apps/web/src/pages/signup-flow.json.ts`
- `apps/web/src/components/site-header.astro`
- `apps/web/src/components/site-footer.astro`
- `apps/web/src/components/cookie-notice.astro`
- `apps/web/src/components/promo-banner.astro`
- `apps/web/src/components/sidebar-cta.astro`
- `apps/web/src/components/lead-magnet-page.astro`
- `apps/web/src/components/exit-intent-popup.tsx`
- `apps/web/src/components/gated-content.tsx`
- `apps/web/src/components/public-signup-cta.tsx`
- `apps/web/src/components/turnstile-widget.tsx`
- `apps/web/src/components/fake-door-pricing.tsx`
- `apps/web/src/components/pricing-promo-assurance.tsx`
- `apps/web/src/lib/lead-magnet-subscribe.ts`
- `apps/web/src/lib/generate-theme-css.ts`
- `apps/web/src/styles/globals.css`
- `apps/web/src/styles/global.css`
- `apps/web/public/_headers`
- `apps/web/public/robots.txt`
- `apps/web/astro.config.mjs`
- `apps/web/src/content/comparisons/*` (filesystem enumeration)
- `apps/web/src/content/lead-magnets/*` (filesystem enumeration)
- `apps/web/src/content/alternatives/*` (filesystem enumeration)

## Notes for next session

- The `.btn-primary` radius fix is one-line in `generate-theme-css.ts` (every preset) + `globals.css:257` fallback: but pull a screenshot diff of every page using `.btn-primary` because the visual delta is repo-wide.
- The CSP fix for Turnstile is two domains in `public/_headers`. After the fix, run the lead-magnet capture form against staging and confirm the Turnstile widget renders without console errors.
- The `/compare/index.astro` link list should be regenerated from `getCollection("comparisons")` at build time so it can't drift again. Same for the resource counts on `/resources/`.
- The trust-page `noindex` flip needs a coordinated `noindex-paths.ts` audit (`astro.config.mjs:8`): that file is what feeds the sitemap filter.

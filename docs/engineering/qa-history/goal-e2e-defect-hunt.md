# Goal: End-to-End Defect Hunt (Gavelhouse)

> **This file is the persistent state for the long-running goal-mode campaign initiated 2026-05-28.**
> Future sessions should read this file FIRST, then continue work from the next unchecked item.
> Goal will not clear until every section under "Outstanding" is empty and verification passes.

## The goal (verbatim from user)

> Go through the entire codebase and find every single bug and missing feature on the frontend, as
> well as missing wiring or incorrect wiring with the backend. AI has built this over iterations,
> component at a time without looking at the big picture or really testing/verifying how things look
> together. Fix every single frontend bug and missing frontend feature on the system, as well as
> missing wiring or incorrect wiring with the backend. UI Integration testing and UI system
> integration testing, as well as full E2E local testing. Everything should play nice together,
> everything should flow together e2e. Sub-agent driven. Multiple review/fix cycles required until
> there is nothing left to fix or complete. Hundreds of agents may take the lead after each context
> window finishes. Buttons should be pills (canonized in CLAUDE.md). Backend code is in scope.
> Name and domain is gavelhouse.app.

## Operating rules for any session picking this up

1. Read CLAUDE.md and this file before doing anything else.
2. Run `git pull --rebase` first.
3. Work in a worktree under `.claude/worktrees/<branch>` for any non-trivial change.
4. Use sub-agents (Explore / general-purpose / editor / web / db) for bounded work.
5. TDD when adding logic. Coverage gates must pass on touched files.
6. After each fix wave: lint + typecheck + test:coverage + reviewer agent + merge + deploy touched
   projects via the canonical `pnpm --filter @boardstack/<app> run deploy` commands.
7. Update this file at the end of every session: move items between "Outstanding" / "In progress"
   / "Done" and add new findings under "Outstanding" as discovered.
8. Buttons are pills. Search for `rounded-md|rounded-lg|rounded-xl|rounded-2xl` on `<button|<Button|<a[^>]*className=` constructs and convert to `rounded-full` wherever the element is an interactive button. Form inputs and cards keep their radii.

## Discovery waves

### Wave 1: initial parallel discovery (2026-05-28)

- [ ] `apps/app` (dashboard SPA): full frontend defect inventory
- [ ] `apps/api` (Hono Worker): endpoint coverage vs dashboard call sites, auth/wiring audit
- [ ] `apps/web` (Astro marketing): page-by-page defects, broken links, brand drift, form wiring
- [ ] Button-shape audit across all three apps (pill canonization)
- [ ] E2E flow audit: signup → onboarding → community setup → invite board → first compliance task
- [ ] E2E flow audit: payments (Stripe subscription billing + dues collection ACH/card)
- [ ] E2E flow audit: owner portal (magic link / token expiry, IDOR resistance)
- [ ] E2E flow audit: lead-magnet capture (marketing → API → nurture email)

## Outstanding (master defect list)

> Populated by discovery agents. Each entry: `[ ] [area] short description (file_path:line if known)`.

### Discovery still owed

- [x] `apps/api` defect inventory: `docs/defect-inventory-api.md` (2026-05-28, general-purpose agent). **5 CRITICAL, 13 HIGH, 22 MED, 4 LOW.** Top CRITICALs: (1) tier enforcement disabled under VITEST env (`domain/policy/access.ts:38`), (2) dues pay flow 3 writes no txn (`finance/dues.ts:560-593`), (3) reserve study DELETE+INSERT no txn (`finance/reserves.ts:150-223`, `:410-439`), (4) journal create leaks raw Postgres errors as 400 (`finance/journal.ts:89-91`), (5) Stripe dues webhook ignores refunds/cancels (`billing/dues-webhook.ts`).
- [x] Deep re-audit of `apps/app`: `docs/defect-inventory-app.md` (2026-05-28, replaced lite-agent result). **4 CRITICAL, 17 HIGH, 24 MED, 14 LOW.** Top CRITICALs: (1) reserves page silently PATCHes `compliance_acknowledged: true` on every mount: fiduciary record toggled by page load (`_app.finance.reserves.tsx:80-94`), (2) billing Stripe handlers have no try/catch, no pending disable: double-billing on rapid click (`_app.billing.tsx`), (3) portal homeowner pay-dues shared mutation, no per-row pending, no onError: double-payment risk (`portal.tsx`), (4) dues `createAssessmentMutation` does Promise.all of N writes with no rollback (`_app.finance.dues.tsx`). HIGH: signOut doesn't clear queryClient → cross-tenant PII leak on shared devices.
- [x] Deep re-audit of `apps/web`: `docs/defect-inventory-web.md` (2026-05-28, replaced lite-agent result). **4 CRITICAL, 9 HIGH, 12 MED, 7 LOW.** Top CRITICALs: (1) CSP `script-src` omits `challenges.cloudflare.com`: Turnstile script blocked, every form non-functional in prod (`apps/web/public/_headers:9`), (2) CSP `frame-src` same omission: challenge iframe blocked, (3) Theme `primaryButtonRadius: var(--radius-md)` violates pill rule site-wide (`lib/generate-theme-css.ts:653,665,675` + `globals.css:257,1261`), (4) `/compare/` index hardcodes links to versus pages that don't exist (`pages/compare/index.astro:7-14`). Plus HIGH: privacy/terms/dpa/subprocessors all noindex'd.
- [ ] Live E2E walk with Playwright MCP across signup → onboarding → community setup → invite board → first compliance task → dues + Stripe → owner portal magic link. No agent has touched live behavior yet.
- [x] Cross-app wiring matrix: `docs/wiring-matrix.md` (2026-05-28). 78 dashboard + 5 marketing call sites mapped to 75 handlers. **0 orphan callers** (caller→handler axis is clean). Dead endpoints: 7, only `POST /finance/accounts/seed` (`apps/api/src/routes/finance/accounts.ts:81`) is truly suspect: likely leftover bootstrap. Also `/lead-magnets/*` ↔ `/waitlist/*` dual mount (`apps/api/src/index.ts:109-110`) doubles surface area; only 4 of those paths actually have callers.

### HIGH-severity fix queue (post-CRITICAL): grouped into disjoint-scope waves

> All 13 inventory CRITICALs are FIXED+deployed. These are the next batches. Group by disjoint write scope so waves can run in parallel worktrees. Source: `docs/defect-inventory-api.md` (api), plus app/web inventories.

**Wave D (api: DONE, shipped @ `115cd05`):**
- [x] C1: removed VITEST tier-bypass; always runs real DB tier/limit resolution (`domain/policy/access.ts`) + re-wired 9 affected test files (mockActiveTier/pushTier). Reviewed APPROVE, merged, deployed.
- [x] `payment_intent.payment_failed`: added `processedStripeEvents` idempotency guard (db.transaction) + scoped UPDATE with `inArray(status,["pending","past_due"])` so paid/waived rows never flip to `past_due` on redelivery (`billing/dues-webhook.ts`). Reviewed APPROVE, merged, deployed.

**Wave E (api governance cluster: uploads & races; disjoint from finance):**
- [ ] Unbounded upload size on violation photos (`governance/violations.ts:258`): reject on content-length before body read.
- [ ] File ext inferred from client content-type (`governance/violations.ts:273-280`): derive from magic bytes.
- [ ] Unbounded attachment upload size (`governance/archRequests.ts:232`): same fix as violations.
- [ ] `attachmentKeys` read-modify-write race (`governance/archRequests.ts:242-247`): `array_append` via SQL or normalized table.
- [ ] Home-limit race in import (`governance/homeowners.ts:199`): re-check inside txn / advisory lock.

**Wave F (api finance + lib + billing resilience):**
- [ ] N+1 on journal-list lines fetch (`finance/journal.ts:146-170`): single join query, group in app.
- [ ] Partial dues payments rejected (`finance/dues.ts:408`): allow partial; recompute `status=partial|paid` from sum.
- [ ] Webhook throws on unknown `priceId` → Stripe retry storm (`billing.ts` subscription.updated): catch → log + 200.
- [ ] Portfolio rollup N+1 fan-out (`portfolio/rollup.ts:51-58`): single aggregating GROUP BY query.
- [ ] KV rate limiter TOCTOU (`lib/rateLimiter.ts:77-87`): atomic counter (Durable Object) or document overshoot bound.
- [ ] Hardcoded AI-CS WORKER_ORIGIN on personal workers.dev (`aiCsProxy.ts`): move to `env.AI_CS_WORKER_ORIGIN`.

**Wave G (app/web HIGHs):**
- [ ] signOut doesn't clear queryClient → cross-tenant PII leak on shared devices (apps/app). *(top app HIGH)*
- [ ] Remaining app HIGH×16 + web HIGH×9: see `docs/defect-inventory-app.md` / `docs/defect-inventory-web.md`.

**Then:** MED/LOW sweeps (api 22/4, app 24/14, web 12/7) + the live E2E Playwright walk (task #4) + re-audit cycles until empty.

### Known artifacts

- `docs/defect-inventory-web.md`: lite-agent output (Wave 1). Treat as "no obvious defects found via grep", not authoritative.
- `docs/defect-inventory-app.md`: lite-agent output (Wave 1). Same caveat.
- `docs/wiring-matrix.md`: cross-app API wiring matrix (Wave 2, general-purpose agent). Authoritative for path/method/caller↔handler matching. 0 orphans, 7 dead endpoints (most external/intentional).
- `docs/defect-inventory-api.md`: apps/api deep audit (Wave 2, general-purpose agent). 5 CRITICAL, 13 HIGH. **Source of truth for the fix waves.**

## In progress

- (none active): Wave H (api MED security cluster) shipped + deployed. Live E2E walk #1 ran (blocked legs unblocked via dev-CORS fix). Next: **re-run the live E2E walk now that local CORS works**, then a frontend fix wave for the E2E-found app/web bugs (see "E2E-derived findings" below), then continue MED/LOW sweeps.
- All 13 CRITICALs across the three deep inventories are FIXED + deployed.

### Session close-out (2026-05-31): finalize pass

- Independent opus review of the full session diff (`bf146c1..d876b39`): **APPROVE, no blockers**. Confirmed no DB migration needed (no schema touched) and the dev-CORS `--var` change cannot reach production (deploy path never runs the `dev` script; `wrangler.toml` hard-sets `SENTRY_ENVIRONMENT=production`).
- Full `pnpm run verify` (exit 0) + `pnpm exec turbo build` (4/4 tasks) now green. This surfaced **6 pre-existing date-bomb test failures** (NOT regressions: identical at `bf146c1`) that tripped specifically on today's date 2026-05-31: 5 from a 30-day signed lead-magnet URL signed at a fixed `2026-05-01` (`downloads.test.ts` ×4, `index.test.ts` ×1) and 1 from a hardcoded `trialEndsAt=2026-05-31` (`billing.test.ts`). Fixed by anchoring all three fixtures to real `Date.now()`: commit `28310c7`, pushed to origin.
- Cleaned up 3 orphaned worktree dirs (`agent-a6bccef…`, `agent-a80ae69…`, `e2e-fix-pass`: unregistered, no `.git` pointer). `git worktree list` now shows only master.
- Live api re-verified serving `d876b39` (`/health` `{commit:"d876b39"}`).
- **BLOCKED on user action:** the `28310c7` api deploy fails at preflight with a **Cloudflare auth error (code 10000)**: the cached wrangler OAuth token expired and there's no `CLOUDFLARE_API_TOKEN` fallback. Re-auth requires an interactive `wrangler login` by the operator. **Functionally harmless:** `d876b39..28310c7` is test-files-only, so the live Worker bundle is byte-identical to HEAD: only the embedded `BUILD_COMMIT` metadata is stale. Re-run `pnpm --filter @boardstack/api run deploy` after re-auth to refresh it.
- Left untouched (not this session's work, require explicit founder go-ahead): branch `draft/privacy-policy-reconciliation` (marked DO NOT PUBLISH / founder-gated) and `goal/crm-feedback-integration` (unmerged feature branch).

### E2E-derived findings (live walk #1, 2026-05-29: `docs/e2e-live-walk-findings.md`)

> The first live walk was blocked on most legs by a **local-dev-only** CORS misconfig (now fixed). Production CORS was always correct. Remaining items are genuine app/web bugs to fix in a frontend wave, then re-walk.

- [x] **C-1 / H-1 (local-dev only):** `wrangler dev` inherited `SENTRY_ENVIRONMENT="production"` from wrangler.toml `[vars]`, so `buildAllowedOrigins()` fail-closed to prod origins and blocked all localhost browser calls. FIXED two ways: repaired drifted local `.dev.vars` (gitignored) + pinned `--var SENTRY_ENVIRONMENT:development` on the api `dev` script (`dc13cd4`, committable, machine-independent). NOT a production bug.
- [ ] **M-1 (app):** "We couldn't reach the server" connection banner renders on initial load on every page before the first `get-session` resolves: verify it doesn't flash on cold loads in prod (root layout / auth provider). `apps/app/src/...`
- [ ] **M-2 (app):** Left-panel "Gavelhouse" brand text is clipped/overflowing on `/login` and `/signup` (CSS width/overflow on the dark panel). `apps/app/src/routes/login.tsx` / `signup.tsx` or shared auth layout.
- [ ] **M-3 (web):** `/compare/gavelhouse-vs-quickbooks/` 404s (actual route is `/compare/versus/quickbooks-vs-gavelhouse/`). Add a redirect from the intuitive slug order (SEO + internal-link safety). `apps/web/src/pages/compare/...`
- [ ] **L-1 (app):** Disabled "Continue with Google" button in dev styled identically to an active button: use a ghost/greyed style. `login.tsx`/`signup.tsx`.
- [ ] **L-2 (web):** Lead-magnet sidebar "Sheet 1/2/3" preview boxes render empty: replace with real previews or remove. `apps/web/src/...`
- [ ] **L-3 (web):** Turnstile script load failure shows no user-facing message; form silently stays disabled: add a fallback notice. `apps/web/src/components/inline-signup.astro` (or equivalent).
- [ ] **H-2 (web, by design caveat):** Lead-magnet form has no graceful degradation / dev bypass when Turnstile can't load: untestable locally. Decide whether a dev-bypass is wanted.
- [x] **Leg 4 reverify:** reserves page compliance-ack confirmed to require explicit checkbox + button (CRIT-APP-1 fix holds).

### Remaining CRITICALs to fix
- (none): all CRITICALs from the api/app/web inventories are resolved. Remaining work is HIGH/MED/LOW + the live E2E walk.

## Done (this campaign)

- 2026-05-29: **Wave H: apps/api MED security/correctness cluster (6 fixes), reviewer APPROVE, merged (`e21a8d6`), deployed + live-verified on `api.gavelhouse.app`.** Plus a standalone local-dev CORS hardening commit (`dc13cd4`).
  - Constant-time compare extracted to `lib/timingSafeEqual.ts`, reused in `aiSdrContext.ts` + `lib/leadMagnetDownloads.ts` (signature no longer compared with `===`). generalLedger optional `accountId` now tenancy-validated (cross-tenant → 404, IDOR closed). `finance/accounts.ts` PATCH returns 404 on 0-row scoped update instead of silent success. `billing.ts` checkout passes deterministic Stripe `idempotencyKey` (`community-<id>-customer`). `lib/observability.ts` adds `uuid` to PostHog payload for retry dedup.
  - Owner-portal token compare was found ALREADY safe (compared in SQL via Drizzle `eq()`, no JS `===`). Reviewer confirmed. 100% per-file coverage on all touched files; 1732 api tests pass.
  - First live E2E walk completed (`docs/e2e-live-walk-findings.md`): all 3 dev servers came up; reserves compliance-ack fix reverified; surfaced the local-dev CORS blocker (fixed) + app/web bugs M-1/M-2/M-3 + LOW items now tracked under "E2E-derived findings".

- 2026-05-29: **Waves E + F + G-app + G-web: all four reviewed APPROVE, merged to `master`, combined `verify` gate GREEN, deployed + live-verified at commit `bf146c1` on all three Workers (`api`/`app`/`web`).** Worktrees torn down; branches deleted.
  - Wave E (`agent-a2446c96a1b7ce66a` → api): governance upload hardening: image-only allow-list in `fileUpload.ts`; `violations.ts` rejects non-image (PDF→415) at both the content-type header gate and the magic-byte body sniff; home-limit race documented (READ COMMITTED caveat).
  - Wave F (`agent-abc274a5c3ac87276` → api): finance/billing resilience: ledger-based partial-payment math with atomic payment+status transaction (removed unreachable `<=0` dead branch, Zod `.min(1)` enforces at validator); N+1 elimination in portfolio rollup (GROUP BY) + journal list (batched `inArray`); rate-limiter TOCTOU overshoot doc; AI-CS proxy requires `AI_CS_WORKER_ORIGIN` (fail-closed 503); billing webhook graceful degradation on unknown Stripe priceId (Sentry log, acknowledge, no tier mutation).
  - Wave G-app (`agent-a56a93b604f7255eb` → app): dashboard HIGHs + pill (`rounded-full`) canonicalization. HIGH-APP-15 community-switch evicts the outgoing community's cached queries (simplified predicate; covered against real seeded queries; fixed localStorage test isolation). Removed stale `react-hooks/exhaustive-deps` disable directive (rule not configured). Fixes across billing cancel modal, file drop zone, close checklist, finance accounts, governance transitions, portfolio index, invitation accept, owner portal, root/app shells.
  - Wave G-web (`agent-af08a24586b0cf332` → web): marketing pill/SEO + AI-discovery: llms.txt/llms-full.txt/pricing.txt sitemap discoverability, noindex paths, footer/SEO metadata consistency. Did NOT touch legal-entity/retention strings (founder-gated reconciliation owns those).
  - Combined gate post-merge: shared 605, api 1717, app 776, web 2429 tests; lint + typecheck clean.

- 2026-05-29: **Wave D: apps/api 2 fixes, both reviewed APPROVE, merged, deployed + live-verified on `api.gavelhouse.app` (commit `115cd05`).**
  - C1 (`b75e844`): removed VITEST tier-resolution bypass from `domain/policy/access.ts` (dropped `isVitest`/`isVitestMockChainError`/`strictMissing`, removed mock-error swallow in `enforceHomeLimit`/`enforceBoardUserLimit` so real DB errors propagate). Callers `requireTier.ts`/`communities.ts` dropped `strictMissing` (404-on-missing preserved). Re-wired ~87 route unit tests across 9 files to mock the subscription/tier lookup without weakening assertions.
  - payment_failed (`4420fe4`): wrapped `payment_intent.payment_failed` in `db.transaction` with `processedStripeEvents` idempotency + scoped UPDATE `inArray(status,["pending","past_due"])`: paid/waived never flipped to past_due on Stripe redelivery.
  - Gates: 1677 api tests pass, coverage 99.6%/97.63%/100/99.81%, typecheck + lint clean.

- 2026-05-28: **Wave C: apps/app 4 CRITICALs + transactional batch-assessments endpoint fixed, reviewed (1 BLOCKER caught + fixed), merged, pushed, deployed + verified live (commit `bc1f4ba`).**
  - CRIT-APP-1: reserves page no longer silently PATCHes `compliance_acknowledged: true` on mount: now requires checkbox + explicit Acknowledge button + success toast (`_app.finance.reserves.tsx`).
  - CRIT-APP-2: billing Stripe handlers converted to `useMutation` with `isPending` disable, `toast.error`, redirect only `onSuccess`: no more double-billing on rapid click (`_app.billing.tsx`).
  - CRIT-APP-3: portal pay-dues now per-row `pendingAssessmentId`, `onSuccess` invalidates `qk.ownerPortal.me`, `onError` toast: no shared-mutation double-payment (`portal.tsx`).
  - CRIT-APP-4: dues `createAssessmentMutation` replaced N-write `Promise.all` fan-out with single transactional `POST /finance/assessments/batch` (`_app.finance.dues.tsx` + new api handler in `finance/dues.ts` + `createAssessmentBatchInput` in `@boardstack/shared`).
  - Reviewer BLOCKER (fixed): batch endpoint skipped the unit→community ownership check that single-create enforces (IDOR: `assessments.unitId` is a nullable FK with no community predicate). Added `inArray` ownership check BEFORE the txn; rewrote tautological rollback test to fail inside the txn callback; added IDOR 400 test.
  - Gates green; both `my.gavelhouse.app` (app) and `api.gavelhouse.app` (api) live-verified at `bc1f4ba`.
- 2026-05-28: **Wave B: apps/web 4 CRITICALs fixed, reviewed (clean, no blockers), cherry-picked to master, gates green, deployed + verified live on `gavelhouse.app` (commit `37494ab`, version `f723d434`).**
  - C-WEB-1+2 (`6bc92f0`): added `https://challenges.cloudflare.com` to CSP `script-src` AND `frame-src` in `public/_headers`: Turnstile script + challenge iframe now load; reviewer confirmed `connect-src` not needed (widget polls `window.turnstile`, no fetch).
  - C-WEB-3 (`2b1bf2e`): all theme CTA presets (solid/soft/outline) + `globals.css` fallback now emit pill radius `9999px` (`--site-primary-button-radius`). Test asserts the emitted string for every preset.
  - C-WEB-4 (`9ad217e`): `/compare/` index now derives versus links from `getCollection` (decoupled from filenames, matches `getStaticPaths`): no more 404 links; empty-collection safe.
  - Gates: web lint clean, typecheck 0 errors, coverage 99.53%/97.75%/100/99.88%.
- 2026-05-28: **Seed-endpoint removal** (`5b6bc12`, deployed + verified live on `api.gavelhouse.app`): removed dead `POST /finance/accounts/seed` (0 callers per wiring matrix; GET handler already auto-seeds). Removed orphaned test block. api lint/typecheck/coverage green.

- 2026-05-28: **Wave A: apps/api 4 CRITICALs fixed, reviewed (2 rounds), merged, pushed, deployed, verified live on `api.gavelhouse.app` (commit `d15b328`).**
  - C2 dues `/pay` wrapped in `db.transaction`. C3 reserve study upsert + CSV import wrapped in `db.transaction`. C4 journal-create stops leaking Postgres errors as 400 (→ captureException + 500). C5 dues webhook now handles `charge.refunded` (proportional partial-refund reversal) + `payment_intent.canceled`, both atomic + idempotent via `processedStripeEvents`.
  - Gates: lint/typecheck clean, 1672 tests pass, dues-webhook.ts 100/97.5/100/100 coverage.
  - Follow-up logged (not blocker): `payment_intent.payment_failed` lacks idempotency guard + could clobber a `paid`→`past_due` assessment on stale redelivery (`billing/dues-webhook.ts:165-182`). Add to a later wave.

- 2026-05-28 (commit `2ec3dff`): Canonized "buttons are pills" rule in `CLAUDE.md` under new "UI Standards" section. Created this tracker.
- 2026-05-28 (commit `c338e75`): Pill canonization wave 1:
  - `apps/app/src/components/ui/button.tsx`: Shadcn Button base + sm + lg sizes converted to `rounded-full`.
  - `apps/app/src/routes/_app.governance.arch-requests.tsx:216`: file-upload Label-as-button.
  - `apps/app/src/routes/_app.governance.violations.tsx:309`: file-upload Label-as-button.
  - `apps/app/src/routes/_app.billing.tsx:456`: billing-cycle toggle group container.
  - `apps/app/src/routes/_app.portfolio.index.tsx:275`: portfolio selector button.
  - `apps/web/src/components/fake-door-pricing.tsx:809`: mobile tier CTA.
  - `apps/web/src/layouts/base-layout.astro:166`: skip-to-content link.
  - Verified: pnpm typecheck clean, ESLint clean, full coverage suite (772 dashboard tests, 100% on button.tsx) passing.
- 2026-05-28: Marketing-site lite audit (no defects flagged). Filed at `docs/defect-inventory-web.md`.
- 2026-05-28: Dashboard lite audit (no defects flagged). Filed at `docs/defect-inventory-app.md`.

## Next session: start here

1. `git pull --rebase` then read this file top-to-bottom.
2. Pick up the "Discovery still owed" list. Prefer `general-purpose` subagent over `Explore`/`lite` (those failed with prompt-length issues here).
3. Build the actual cross-app wiring matrix (every dashboard `api.*` call ↔ matching API handler). That is the highest-signal deliverable for the user's "missing/incorrect wiring" concern.
4. Stand up Playwright MCP locally (`pnpm exec turbo dev` first) and walk the signup → setup → dues → portal flow end-to-end. Screenshot every step. Log every console error.
5. Re-audit buttons after any new components land.

## Notes / context for future sessions

- Three apps: `apps/app` (React 19 SPA, port 3060), `apps/web` (Astro 5, port 3061), `apps/api` (Hono on Workers, port 8060).
- Local dev: `pnpm exec turbo dev` runs all three. Browser-based E2E should use Playwright MCP.
- Stripe is wired for both SaaS billing and HOA dues. Two different sets of webhooks: keep them straight.
- Better Auth uses email+password and Google OAuth. Magic-link is used for owner portal access.
- Coverage gate: 95% on touched files; route `.tsx` and `.astro` page files are excluded.
- The canonical button is in `apps/app/src/components/ui/button.tsx`. Marketing site uses Astro/Tailwind utility classes for buttons; update the shared class string or create a `<PillButton>` Astro component.

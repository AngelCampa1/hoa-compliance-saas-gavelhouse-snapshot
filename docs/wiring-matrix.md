# API Wiring Matrix

> Generated 2026-05-28. Reconciles every dashboard (`apps/app`) and marketing-site (`apps/web`) HTTP call against API handlers in `apps/api/src/routes/**`.

All caller line numbers refer to `apps/app/src/lib/api.ts` unless otherwise noted. Handler line numbers point at the `.METHOD(` call. Routes are listed at the path they expose **after** the `apps/api/src/index.ts` mount — every concrete subrouter in this repo is mounted at `app.route("/", ...)`, so the handler-internal path equals the mounted path, with three exceptions:

- `leadMagnetApp` is mounted **twice**, at both `/lead-magnets` and `/waitlist` (`index.ts:109-110`).
- `unsubscribeApp` is mounted at `/unsubscribe` (`index.ts:112`).
- All other routers register their paths absolutely (`/api/...`, `/billing/...`, `/finance/...`, etc.).

## Summary

- Total dashboard call sites (apps/app): **78** distinct method+path pairs (counted from `api.ts` + `auth.ts`).
- Total marketing call sites (apps/web): **5** distinct method+path pairs.
- Total API endpoints exposed: **75** (including duplicated `/lead-magnets/*` ↔ `/waitlist/*` mounts and `/health` ↔ `/api/health` aliases; **57** distinct handler functions).
- **Orphan callers (frontend reaches an endpoint that does not exist): 0.** Every dashboard and marketing caller has a matching handler at the exact method+path.
- **Dead endpoints (handler exists, no in-repo caller): 7** — most are intentionally external (Stripe webhooks, Better-Auth, AI-SDR widget, email links). The one truly suspicious dead endpoint is `POST /finance/accounts/seed`.

## Dashboard (apps/app) → API

| Method | Path | Caller | Handler | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/providers` | `api.ts:553` (`api.auth.providers`) | `auth.ts:90` | ✓ |
| POST | `/api/auth/send-verification-email` | `auth.ts:22` | `auth.ts:20` (catch-all `/api/auth/*`) | ✓ |
| POST | `/api/auth/*` (signin/signup/session/etc.) | better-auth SDK | `auth.ts:20` | ✓ |
| GET | `/communities/me` | `api.ts:557` | `communities.ts:110` | ✓ |
| POST | `/communities` | `api.ts:561` | `communities.ts:121` | ✓ |
| PATCH | `/communities/setup` | `api.ts:566` | `communities.ts:164` | ✓ |
| POST | `/communities/:id/invitations` | `api.ts:572` | `communities.ts:216` | ✓ |
| POST | `/invitations/:token/accept` | `api.ts:577` | `communities.ts:261` | ✓ |
| GET | `/communities/:id/usage` | `api.ts:582` | `communitiesUsage.ts:40` | ✓ |
| POST | `/communities/:id/homeowners` | `api.ts:1040` (`governance.homeowners.add`) | `governance/homeowners.ts:278` | ✓ |
| GET | `/activation` | `api.ts:588` | `activation.ts:26` | ✓ |
| PATCH | `/activation/:step` | `api.ts:591` | `activation.ts:58` | ✓ |
| GET | `/finance/accounts` | `api.ts:600` | `finance/accounts.ts:36` | ✓ |
| POST | `/finance/accounts` | `api.ts:610` | `finance/accounts.ts:113` | ✓ |
| PATCH | `/finance/accounts/:id` | `api.ts:623` | `finance/accounts.ts:173` | ✓ |
| GET | `/finance/reserves/summary` | `api.ts:631` | `finance/reserves.ts:225` | ✓ |
| PUT | `/finance/reserves/study` | `api.ts:648` | `finance/reserves.ts:249` | ✓ |
| PATCH | `/finance/reserves/allocation` | `api.ts:657` | `finance/reserves.ts:306` | ✓ |
| POST | `/finance/reserve-study/import` | `api.ts:663` | `finance/reserves.ts:356` | ✓ |
| GET | `/finance/units` | `api.ts:674` | `finance/dues.ts:96` | ✓ |
| POST | `/finance/units` | `api.ts:682` | `finance/dues.ts:115` | ✓ |
| GET | `/finance/homeowners` | `api.ts:688` | `finance/dues.ts:143` | ✓ |
| POST | `/finance/homeowners` | `api.ts:698` | `finance/dues.ts:201` | ✓ |
| GET | `/finance/assessments` | `api.ts:712` | `finance/dues.ts:254` | ✓ |
| POST | `/finance/assessments` | `api.ts:722` | `finance/dues.ts:309` | ✓ |
| POST | `/finance/dues/pay` | `api.ts:738` | `finance/dues.ts:379` | ✓ |
| GET | `/finance/journal` | `api.ts:761` | `finance/journal.ts:102` | ✓ |
| GET | `/finance/journal/:entryId` | `api.ts:765` | `finance/journal.ts:180` | ✓ |
| POST | `/finance/journal` | `api.ts:773` | `finance/journal.ts:44` | ✓ |
| POST | `/governance/homeowners/import` | `api.ts:467` (`importHomeowners`) | `governance/homeowners.ts:120` | ✓ |
| GET | `/reports/trial-balance` | `api.ts:781` | `reports/trialBalance.ts:29` | ✓ |
| GET | `/reports/balance-sheet` | `api.ts:785` | `reports/balanceSheet.ts:29` | ✓ |
| GET | `/reports/income-statement` | `api.ts:789` | `reports/incomeStatement.ts:36` | ✓ |
| GET | `/reports/general-ledger` | `api.ts:802` | `reports/generalLedger.ts:29` | ✓ |
| GET | `/reports/audit-pack` | `api.ts:812` (`downloadBlob`) | `reports/auditPack.ts:29` | ✓ |
| GET | `/reports/role-handoff` | `api.ts:818` (`downloadBlob`) | `reports/roleHandoff.ts:29` | ✓ |
| GET | `/bank/statements` | `api.ts:826` | `bank/statements.ts:155` | ✓ |
| POST | `/bank/statements` | `api.ts:836` | `bank/statements.ts:37` | ✓ |
| GET | `/bank/reconciliations/:id` | `api.ts:846` | `bank/reconciliations.ts:39` | ✓ |
| POST | `/bank/reconciliations/:id/matches` | `api.ts:859` | `bank/reconciliations.ts:109` | ✓ |
| DELETE | `/bank/reconciliations/:id/matches/:matchId` | `api.ts:871` | `bank/reconciliations.ts:222` | ✓ |
| POST | `/bank/reconciliations/:id/finalize` | `api.ts:879` | `bank/reconciliations.ts:262` | ✓ |
| GET | `/portfolio` | `api.ts:885` | `portfolio/portfolios.ts:105` | ✓ |
| POST | `/portfolio` | `api.ts:887` | `portfolio/portfolios.ts:76` | ✓ |
| PATCH | `/portfolio/:id` | `api.ts:892` | `portfolio/portfolios.ts:124` | ✓ |
| DELETE | `/portfolio/:id` | `api.ts:897` | `portfolio/portfolios.ts:166` | ✓ |
| POST | `/portfolio/:id/communities` | `api.ts:899` | `portfolio/portfolios.ts:203` | ✓ |
| DELETE | `/portfolio/:id/communities/:communityId` | `api.ts:905` | `portfolio/portfolios.ts:282` | ✓ |
| GET | `/portfolio/:id/rollup` | `api.ts:910` | `portfolio/rollup.ts:32` | ✓ |
| GET | `/close` | `api.ts:916` | `monthEndClose/closes.ts:418` | ✓ |
| POST | `/close/start` | `api.ts:919` | `monthEndClose/closes.ts:106` | ✓ |
| PATCH | `/close/:id/steps/:step` | `api.ts:929` | `monthEndClose/closes.ts:181` | ✓ |
| POST | `/close/:id/complete` | `api.ts:938` | `monthEndClose/closes.ts:245` | ✓ |
| GET | `/close/:id/pack-url` | `api.ts:943` (URL builder) | `monthEndClose/closes.ts:343` | ✓ |
| GET | `/close/:id/checklist` | `api.ts:946` | `monthEndClose/closes.ts:385` | ✓ |
| POST | `/api/feedback` | `api.ts:951` | `feedback.ts:41` | ✓ |
| POST | `/api/ai-cs/session` | `api.ts:958` | `aiCsProxy.ts:38` (ACTIONS loop) | ✓ |
| POST | `/api/ai-cs/chat` | `api.ts:963` | `aiCsProxy.ts:38` (ACTIONS loop) | ✓ |
| POST | `/api/ai-cs/escalation` | `api.ts:968` | `aiCsProxy.ts:38` (ACTIONS loop) | ✓ |
| GET | `/billing/status` | `api.ts:975` | `billing.ts:297` | ✓ |
| POST | `/billing/start-trial` | `api.ts:983` | `billing.ts:333` | ✓ |
| POST | `/billing/checkout` | `api.ts:994` | `billing.ts:429` | ✓ |
| POST | `/billing/portal` | `api.ts:999` | `billing.ts:587` | ✓ |
| POST | `/billing/cancel` | `api.ts:1005` | `billing/cancel.ts:19` | ✓ |
| GET | `/governance/homeowners` | `api.ts:1015` | `governance/homeowners.ts:59` | ✓ |
| GET | `/governance/meetings` | `api.ts:1047` | `governance/meetings.ts:67` | ✓ |
| POST | `/governance/meetings` | `api.ts:1057` | `governance/meetings.ts:85` | ✓ |
| PATCH | `/governance/meetings/:id/minutes` | `api.ts:1063` | `governance/meetings.ts:110` | ✓ |
| GET | `/governance/meetings/:id/motions` | `api.ts:1071` | `governance/meetings.ts:141` | ✓ |
| POST | `/governance/meetings/:id/motions` | `api.ts:1075` | `governance/meetings.ts:162` | ✓ |
| PATCH | `/governance/motions/:id/resolve` | `api.ts:1086` | `governance/meetings.ts:196` | ✓ |
| POST | `/governance/motions/:id/votes` | `api.ts:1098` | `governance/meetings.ts:226` | ✓ |
| GET | `/governance/motions/:id/votes` | `api.ts:1106` | `governance/meetings.ts:268` | ✓ |
| GET | `/governance/violations` | `api.ts:1112` | `governance/violations.ts:116` | ✓ |
| POST | `/governance/violations` | `api.ts:1121` | `governance/violations.ts:134` | ✓ |
| PATCH | `/governance/violations/:id/status` | `api.ts:1127` | `governance/violations.ts:181` | ✓ |
| GET | `/governance/violations/:id/events` | `api.ts:1132` | `governance/violations.ts:236` | ✓ |
| POST | `/governance/violations/:id/photos` | `api.ts:1136` | `governance/violations.ts:258` | ✓ |
| GET | `/governance/arch-requests` | `api.ts:1149` | `governance/archRequests.ts:123` | ✓ |
| POST | `/governance/arch-requests` | `api.ts:1157` | `governance/archRequests.ts:141` | ✓ |
| PATCH | `/governance/arch-requests/:id/review` | `api.ts:1165` | `governance/archRequests.ts:178` | ✓ |
| POST | `/governance/arch-requests/:id/attachments` | `api.ts:1170` | `governance/archRequests.ts:213` | ✓ |
| GET | `/governance/transitions` | `api.ts:1183` | `governance/boardTransitions.ts:21` | ✓ |
| PATCH | `/governance/transitions/:id/acknowledge` | `api.ts:1187` | `governance/boardTransitions.ts:45` | ✓ |
| PATCH | `/governance/transitions/:id/complete` | `api.ts:1192` | `governance/boardTransitions.ts:82` | ✓ |
| POST | `/owner/sessions` | `api.ts:1203` | `governance/ownerPortal.ts:93` | ✓ |
| GET | `/owner/me` | `api.ts:1266` (`ownerPortalApi.getMe`) | `governance/ownerPortal.ts:191` | ✓ |
| GET | `/owner/arch-requests` | `api.ts:1269` | `governance/ownerPortal.ts:452` | ✓ |
| POST | `/owner/arch-requests` | `api.ts:1274` | `governance/ownerPortal.ts:474` | ✓ |
| POST | `/owner/dues/pay` | `api.ts:1292` | `governance/ownerPortal.ts:282` | ✓ |

## Marketing (apps/web) → API

| Method | Path | Caller | Handler | Status |
| --- | --- | --- | --- | --- |
| POST | `/waitlist/subscribe` | `components/exit-intent-popup.tsx:273`; `components/email-capture.tsx:304`; `components/pricebook-builder.tsx:158` | `leadMagnet.ts:167` (mounted at `/waitlist`, `index.ts:110`) | ✓ |
| POST | `/lead-magnets/subscribe` | `lib/lead-magnet-subscribe.ts:37` | `leadMagnet.ts:167` (mounted at `/lead-magnets`, `index.ts:109`) | ✓ |
| POST | `/waitlist/pricing-click` | `components/fake-door-pricing.tsx:378` | `leadMagnet.ts:141` (mounted at `/waitlist`) | ✓ |
| POST | `/waitlist/survey` | `components/post-signup-survey.tsx:191,224` | `leadMagnet.ts:487` (mounted at `/waitlist`) | ✓ |
| GET | `/billing/limited-offer` | `pages/pricing.astro:281`; `components/promo-bar.astro:35` | `billing.ts:278` | ✓ |

Two additional `fetch(` call sites in `apps/web/src` resolve to **static JSON config URLs**, not API endpoints, and are intentionally excluded:

- `components/email-capture.tsx:220` → `signupFlowConfigUrl` (e.g. `/signup-flow.json`)
- `components/fake-door-pricing.tsx:289` → `emailCaptureConfigUrl` (same family)

## Orphan callers (BUGS — frontend will 404)

**None.** Every method+path pair issued from `apps/app` and `apps/web` has a matching Hono handler at the exact mounted path. The CORS preflight, auth-middleware wrapping, and audit middleware mounts in `apps/api/src/index.ts:117-132` cover every prefix used by the frontends.

## Dead endpoints (handler exists, no in-repo caller)

| Method | Path | Handler | Notes |
| --- | --- | --- | --- |
| POST | `/finance/accounts/seed` | `finance/accounts.ts:81` | **Truly suspect.** No reference anywhere in `apps/app/**` or `apps/web/**`. Likely seed/admin scaffolding left over from initial CoA bootstrapping; safe-to-review for removal. |
| POST | `/billing/webhook` | `billing.ts:633` | Called by Stripe (external). Keep. |
| POST | `/billing/dues-webhook` | `billing/dues-webhook.ts:15` | Called by Stripe (external). Keep. |
| GET | `/api/ai-sdr/context` | `aiSdrContext.ts:49` | Called by the Ventora AI-SDR embed widget on the marketing site at runtime via injected script (not a `fetch(` call in our source). Keep. |
| GET | `/downloads/:filename` | `downloads.ts:11` | Lead-magnet PDF download links rendered into outbound emails (external clicks). Keep. |
| GET | `/unsubscribe` | `unsubscribe.ts:21` (mounted at `/unsubscribe`) | Email unsubscribe link target. Keep. |
| GET | `/unsubscribe/signup` | `unsubscribe.ts:15` | Email unsubscribe link target. Keep. |
| GET | `/health`, `/api/health` | `health.ts:42-43` | Cloudflare / uptime probe. Keep. |
| POST | `/lead-magnets/pricing-click` | `leadMagnet.ts:141` via `/lead-magnets` mount | Same handler is reached via `/waitlist/pricing-click` (used). The `/lead-magnets/*` alias for `pricing-click` is unused — marketing always calls the `/waitlist` variant. Dual-mount cleanup candidate. |
| POST | `/lead-magnets/survey` | `leadMagnet.ts:487` via `/lead-magnets` mount | Same as above — only the `/waitlist/survey` alias is in use. Dual-mount cleanup candidate. |

### Notes on the `/lead-magnets` ↔ `/waitlist` dual mount

`apps/api/src/index.ts:109-110` exposes the same `leadMagnetApp` router under two prefixes. The frontend convention is:

- `/lead-magnets/subscribe` — used by per-magnet PDF capture (`lib/lead-magnet-subscribe.ts`)
- `/waitlist/subscribe`, `/waitlist/pricing-click`, `/waitlist/survey` — used by the rest of the marketing site components

This is intentional historical aliasing (marketing started as a waitlist before being repurposed for lead magnets) and is not a wiring defect, but the duplicated routes inflate the surface area and create the two dead-alias rows above.

# E2E Live Walk Findings: 2026-05-29

## Environment / Setup

| Server | Port | Status |
|--------|------|--------|
| `@boardstack/api` (Hono Worker via `wrangler dev`) | 8060 | UP |
| `@boardstack/app` (React SPA via Vite) | 3060 | UP |
| `@boardstack/web` (Astro marketing) | 3061 | UP |

All three servers started and responded to HTTP checks before browser work began.

---

## Prioritized Findings

### CRITICAL

**C-1: CORS completely broken for all local-dev API calls**
Every single browser-originated API call from `http://localhost:3060` and `http://localhost:3061` to `http://localhost:8060` is blocked by CORS. The API returns `Access-Control-Allow-Credentials: true` but **omits** `Access-Control-Allow-Origin`. Root cause: `apps/api/wrangler.toml` sets `SENTRY_ENVIRONMENT = "production"` in the default `[vars]` block, and `buildAllowedOrigins()` in `apps/api/src/index.ts` (line 47-50) returns only the two `gavelhouse.app` origins when `SENTRY_ENVIRONMENT === "production"`: before even checking `APP_URL` / `BETTER_AUTH_URL`. The `.dev.vars` file overrides `APP_URL` and `BETTER_AUTH_URL` to localhost but does NOT override `SENTRY_ENVIRONMENT`, so the production gate fires. The `[env.dev]` block in `wrangler.toml` also does not override `SENTRY_ENVIRONMENT`. Because the dev script is `wrangler dev --port 8060` (no `--env dev`), the default vars apply and the CORS allow-list is production-only.

**Effect:** Signup, login, onboarding, every authenticated route: all completely broken in local dev. Legs 2-6 of this walk could not be completed by browser.

**Files:** `apps/api/wrangler.toml` (line 12, `SENTRY_ENVIRONMENT = "production"` in `[vars]`), `apps/api/src/index.ts` (lines 41-67, `buildAllowedOrigins`), `apps/api/.dev.vars` (missing `SENTRY_ENVIRONMENT = "development"` entry).

**Fix:** Add `SENTRY_ENVIRONMENT = "development"` to `apps/api/.dev.vars`. This overrides the wrangler.toml default for local dev without changing production behavior.

---

### HIGH

**H-1: `/billing/limited-offer` CORS error on every marketing site page**
`GET http://localhost:8060/billing/limited-offer` is called by a client-side React island on the marketing site to fetch limited-offer banner state. It fails with the same CORS block as C-1. Every page on `localhost:3061` emits two console errors: `CORS policy: No 'Access-Control-Allow-Origin' header` + `net::ERR_FAILED`. This is the same root cause as C-1 but independently blocks marketing-site functionality.

**Files:** `apps/web/src/` (whichever island component calls `/billing/limited-offer`), `apps/api/src/index.ts`.

**H-2: Lead magnet signup form completely disabled (Turnstile widget unreachable)**
On `http://localhost:3061/free/50-state-reserve-fund-requirements/`, the email input and submit button are `disabled` because the Cloudflare Turnstile widget script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) fails to load. The form's JavaScript depends on a Turnstile token before enabling submission. In local dev without internet access to Cloudflare, the form is permanently broken. The CORS block on the API (`POST /lead-magnet/subscribe`) would also prevent submission even if Turnstile loaded.

**Severity note:** This is expected behavior for a captcha-gated form, but there is no graceful degradation or local dev bypass, making the lead magnet flow completely untestable locally.

**Files:** `apps/web/src/` (lead magnet page / inline-signup component), `apps/api/src/routes/leadMagnet.ts`.

---

### MEDIUM

**M-1: "Connection issue" banner shown on every app page even before user action**
The banner `"We couldn't reach the server. You may need to reload or re-login once your connection is restored."` appears immediately on every page of `localhost:3060` on load: before the user does anything. This is triggered by the CORS failures on the initial `GET /api/auth/get-session` calls. While technically caused by C-1, the UX impact deserves its own callout: even when CORS is fixed in production (where CORS is correct), this banner likely fires during the brief window before the session check resolves.

**Files:** `apps/app/src/` (likely in the root layout or auth provider: the component that listens for network errors and renders the banner).

**M-2: Left-panel "Gavelhouse" branding text clipped on login/signup pages**
On both `/login` and `/signup`, the left dark panel shows the Gavelhouse logo + brand name but the word "Gavelhouse" is visually clipped (renders as "Gavelhaus" + overflow hidden). This is a CSS overflow or width issue on the panel text element.

**Files:** `apps/app/src/routes/login.tsx`, `apps/app/src/routes/signup.tsx` (or a shared auth layout component).

**M-3: `/compare/gavelhouse-vs-quickbooks/` returns 404**
The URL `http://localhost:3061/compare/gavelhouse-vs-quickbooks/` returns a 404. The correct URL for the QuickBooks comparison is `http://localhost:3061/compare/versus/quickbooks-vs-gavelhouse/` (slugA=quickbooks, slugB=gavelhouse per the content frontmatter). However, the content file is named `gavelhouse-vs-quickbooks.md`, which might lead users/internal links to the wrong URL. No redirect exists from the intuitive `/compare/gavelhouse-vs-quickbooks/` pattern to the actual `/compare/versus/slugA-vs-slugB/` structure.

**Files:** `apps/web/src/content/comparisons/gavelhouse-vs-quickbooks.md`, `apps/web/src/pages/compare/versus/[slugA]-vs-[slugB].astro`.

---

### LOW

**L-1: Google sign-in is permanently disabled with a text notice, no progressive enhancement**
On `/signup` and `/login`, the "Continue with Google" button is always `disabled` in dev, with a message "Google sign-in is unavailable in this environment." This is correct behavior for dev but the disabled button is visually styled inconsistently (same visual as an active button but non-interactive). A ghost/greyed-out style or complete removal in non-Google environments would be cleaner.

**Files:** `apps/app/src/routes/signup.tsx`, `apps/app/src/routes/login.tsx`.

**L-2: Lead magnet "Get the file" sidebar card on `/free/` pages shows empty sheet previews**
Three placeholder boxes labeled "Sheet 1", "Sheet 2", "Sheet 3" are rendered as visually empty white rectangles. These appear to be image/preview placeholders for the document. If intentional (images to be added later), they should be removed or replaced with a representative icon/description.

**Files:** `apps/web/src/` (lead magnet layout or sidebar component).

**L-3: Turnstile script load failure emits an unhandled console error**
`Failed to load resource: net::ERR_NETWORK_CHANGED @ https://challenges.cloudflare.com/turnstile/v0/api.js` appears on lead magnet pages. If Turnstile fails to load, the form just stays disabled without any user-facing message explaining why. A timeout/fallback message ("Security check unavailable. Please try again later.") would improve UX.

**Files:** `apps/web/src/components/inline-signup.astro` (or whichever component embeds Turnstile).

---

## Leg-by-Leg Results

### Leg 1: Marketing Site (http://localhost:3061)

**Status: PARTIAL PASS / FINDING**

| Page | Load | Console Errors | Notes |
|------|------|----------------|-------|
| `/` (home) | PASS | 2 errors (CORS on `/billing/limited-offer`) | Content renders correctly, pill CTAs confirmed |
| `/pricing/` | PASS | 2 errors (same CORS) | Pricing content renders, CTAs point to `https://my.gavelhouse.app/signup` |
| `/compare/` | PASS | 2 errors (same CORS) | Index page renders |
| `/compare/versus/quickbooks-vs-gavelhouse/` | PASS | 2 errors (same CORS) | Correct URL works |
| `/compare/gavelhouse-vs-quickbooks/` | FAIL | 404 | Wrong URL convention: see M-3 |
| `/compare/alternatives/` | PASS | 2 errors (same CORS) | Renders |
| `/privacy/` | PASS | 0 errors | Clean load |
| `/terms/` | PASS | 2 errors (same CORS) | Content renders |
| `/free/50-state-reserve-fund-requirements/` | PARTIAL | 3 errors (CORS + Turnstile fail) | Page content loads but signup form is disabled |

**CTA button shape:** Confirmed `rounded-full` pill shape on all tested pages. `border-radius: 2.68435e+07px` computed.

**Branding:** No old `boardstack.*`, `pebbledesk.*`, or `@boardstackhq` references found in visible content. All CTAs point to `https://my.gavelhouse.app`.

### Leg 2: Signup / Onboarding (http://localhost:3060)

**Status: BLOCKED by C-1 (CORS)**

- `/signup` page renders fully (form, branding, pills).
- On form submission: `POST http://localhost:8060/api/auth/sign-up/email` blocked by CORS preflight. Error toast shows: "We could not create your account. Please try again. Tracking ID: 9d20e8431f8b453c94f003ffc3d10caf": good error UX, bad root cause.
- Onboarding and community creation could not be reached.

**Network failures on this leg:**
```text
GET  http://localhost:8060/api/auth/get-session   → net::ERR_FAILED (CORS)
GET  http://localhost:8060/api/auth/providers     → net::ERR_FAILED (CORS preflight)
POST http://localhost:8060/api/auth/sign-up/email → net::ERR_FAILED (CORS preflight)
```

### Leg 3: Invite a Board Member

**Status: BLOCKED by C-1 (CORS)**

Could not create an account to reach the invite flow. However, the invitation accept page at `/invitations/:token/accept` renders correctly for unauthenticated state: shows "Join community" card with "Sign in" and "Create account" pill buttons. No crashes with an invalid token.

### Leg 4: Compliance / Reserves Page

**Status: CODE REVIEW PASS (browser blocked by C-1)**

Direct code inspection of `apps/app/src/routes/_app.finance.reserves.tsx` confirms:
- Compliance acknowledgement requires explicit user action: checkbox `complianceChecked` must be `true` AND button must be clicked.
- `useEffect` only sets `annualBudget` / `annualReserveContribution` field values from `summaryData`: it does NOT trigger the compliance mutation on mount.
- `acknowledgeComplianceMutation.mutate()` is called only in the `onClick` handler on line 339.
- The previously-reported CRITICAL (auto-acknowledging on mount) is FIXED and confirmed not present.

### Leg 5: Dues / Assessment Flow

**Status: BLOCKED by C-1 (CORS)**

Could not reach authenticated routes. Code inspection of `apps/app/src/routes/_app.finance.dues.tsx` shows the dues flow exists with proper assessment creation, status badges, and owner-facing payment flow in `apps/app/src/routes/portal.tsx`. No code-level issues found in static review.

### Leg 6: Owner Portal Magic Link

**Status: PARTIAL / BLOCKED**

`/portal` without a token renders the correct "This portal link is missing" message with contextual help. No crash.
`/portal?token=<expired>` would trigger the `isOwnerTokenExpired` check and show an appropriate error.
Full magic-link flow (API call to generate link → email delivery → portal with valid token) blocked by C-1.

---

## Summary of All Console Errors Observed

| Page | Error | Count |
|------|-------|-------|
| Every web page (3061) | `CORS: No 'Access-Control-Allow-Origin'` on `/billing/limited-offer` | 2 per page |
| Every app page (3060) | `CORS: No 'Access-Control-Allow-Origin'` on `/api/auth/get-session` | 2-4 per page |
| Every app page (3060) | `CORS preflight` on `/api/auth/providers` | 2 per page |
| Lead magnet page | `net::ERR_NETWORK_CHANGED` on Turnstile script | 1 |
| Signup submit | `CORS preflight` on `/api/auth/sign-up/email` | 2 |

---

## Fix Priority Order

1. **[CRITICAL: C-1]** Add `SENTRY_ENVIRONMENT = "development"` to `apps/api/.dev.vars`. This unblocks ALL local dev browser testing in a single line.
2. **[HIGH: H-1]** Same fix as C-1 resolves the marketing-site `/billing/limited-offer` CORS error.
3. **[MEDIUM: M-2]** Fix branding text overflow on login/signup left panel.
4. **[MEDIUM: M-3]** Add a redirect or rename the QuickBooks comparison content slug so `/compare/gavelhouse-vs-quickbooks/` redirects to the correct path.
5. **[LOW: L-3]** Add a user-facing message when Turnstile fails to load.
6. **[LOW: L-2]** Remove or replace empty sheet preview boxes on lead magnet pages.

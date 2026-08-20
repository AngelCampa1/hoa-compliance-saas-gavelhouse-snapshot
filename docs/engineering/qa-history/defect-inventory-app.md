# Defect Inventory: @boardstack/app (deep audit, replaces lite-agent output)

**Audit Date:** 2026-05-28
**Scope:** `apps/app` React 19 + Vite + TanStack Router dashboard SPA
**Method:** Manual route-by-route + component walk. READ-ONLY.
**Cross-ref:** API-side issues belong in `docs/defect-inventory-api.md`: not duplicated here.

## Summary

| Severity   | Count |
|------------|-------|
| CRITICAL   | 4     |
| HIGH       | 17    |
| MED        | 24    |
| LOW        | 14    |
| **Total**  | **59**|

Categories covered: data fetching, forms, loading/error states, optimistic updates, auth/session,
navigation, a11y, wiring drift vs apps/api, currency/date precision, useEffect dep regressions,
toast UX, button states (double-click, destructive confirm).

---

## CRITICAL

### CRIT-APP-1: Reserve study page silently flips `compliance_acknowledged` on every visit
`apps/app/src/routes/_app.finance.reserves.tsx:80-94`: A `useEffect` calls
`PATCH /finance/reserves/compliance` (or equivalent mutation) with
`compliance_acknowledged: true` as soon as the page mounts and a study is present, with no user
gesture, no confirmation, and no audit trail prompt. This is a fiduciary-grade record being toggled
by mere page load. Risk: a board member viewing a study is recorded as having acknowledged
state-statute reserve compliance they never agreed to.
**Fix:** require an explicit checkbox + "Acknowledge" button; emit an audit-log entry server-side
including the actor's session ID and timestamp.

### CRIT-APP-2: Billing Stripe handlers silently fail and allow double-click duplicate sessions
`apps/app/src/routes/_app.billing.tsx` (`handleCheckout`, `handleStartTrial`, `handleBillingPortal`): each handler does `const url = await api.billing.checkout(...); window.location.href = url;` with
no try/catch, no `isPending` button-disable, and no `toast.error` on rejection. If the API errors
(network blip, Stripe outage, tier mismatch on server), the user sees nothing and the button is
still clickable. Rapid clicks create multiple Checkout sessions; if any of them complete the user
is billed twice.
**Fix:** wrap in mutations with `isPending` disabling the button, error toast on rejection, and
guard against re-entry via a ref or local `useState` flag.

### CRIT-APP-3: Owner portal pay-dues mutation is shared across all assessment rows
`apps/app/src/routes/portal.tsx`: a single `paymentMutation` is hoisted to component scope and
each row's Pay button calls `paymentMutation.mutate({ assessmentId })`. Combined with no
`onSuccess` invalidation of `qk.portal.assessments(...)` and no `onError` toast, a homeowner
clicking Pay on multiple rows in quick succession can fire multiple Stripe sessions, and the UI
never reflects which one succeeded. Race conditions allow double-pay.
**Fix:** track per-row pending state (Map<assessmentId, boolean>), `onSuccess` invalidate portal
assessments + balance, `onError` toast, and disable the row while pending.

### CRIT-APP-4: Bulk assessment creation has no transactional rollback on partial failure
`apps/app/src/routes/_app.finance.dues.tsx` `createAssessmentMutation` (or
`createAssessmentBatchMutation`) issues `Promise.all(homes.map(h => api.assessments.create(...)))`
client-side. If 4 of 12 writes fail the dashboard shows partial success with no clear remediation;
the underlying API has no batch endpoint that rolls back. Homeowners then have inconsistent
ledger state (some charged, some not).
**Fix:** add a server-side batch endpoint with one DB transaction; until then, surface per-home
failure list with retry per row, and never claim "Assessment created" on partial success.

---

## HIGH

### HIGH-APP-1: Sign-out leaks cached tenant data into next session
`apps/app/src/routes/_app.tsx` and `apps/app/src/routes/owner.tsx`: `handleSignOut` calls
`authClient.signOut()` then `navigate({ to: "/login" })` without `queryClient.clear()`. Any
React Query cache (community list, balances, homeowner PII) persists in memory; if a second user
signs in on the same device they briefly see the previous tenant's data before queries refetch.
**Fix:** `queryClient.clear()` before navigate; consider `queryClient.removeQueries()` for keys
known to contain PII even on auth failures.

### HIGH-APP-2: Bank reconciliation requires raw UUID paste with no candidate picker
`apps/app/src/components/bank/ReconcileGrid.tsx`: to match a statement line to a journal entry,
users must literally paste the journal-entry UUID into a text input. No combobox, no candidate
list filtered by date+amount proximity. This is unusable for board members.
**Fix:** typeahead Combobox sourced from a candidate-match endpoint that returns nearby journals
by amount/date.

### HIGH-APP-3: Invitation accept retry-loops on permanent errors
`apps/app/src/routes/invitations.$token.accept.tsx`: `useEffect` deps include `[mutation, session]`.
The `mutation` object reference changes every render, causing the effect to re-fire continuously
after any non-success state. On a permanently-bad token (already-used, revoked) the dashboard
hammers the API.
**Fix:** depend only on stable identifiers (`session?.user?.id`, token string); guard with a
`useRef` "already attempted" flag.

### HIGH-APP-4: Close checklist local state never resyncs after server change
`apps/app/src/components/close/CloseChecklist.tsx:37`: `const [localItems, setLocalItems] =
useState(items)` initializes from props once. If another board member completes a step the query
refetches, but `localItems` is stale until full unmount/remount.
**Fix:** `useEffect(() => setLocalItems(items), [items])` or drop the local mirror and use the
query data directly with optimistic updates via `setQueryData`.

### HIGH-APP-5: File-drop zone opens picker on virtually any key press
`apps/app/src/components/ui/file-drop-zone.tsx`: `onKeyDown` opens the file picker when `e.key`
matches `"Enter"`, `" "`, `"Spacebar"`, `"Unidentified"`, falsy `!e.key`, OR `e.code === "Space"`.
Tab navigation through the zone triggers the OS file dialog on browsers that report
`"Unidentified"`. Severe a11y/UX regression.
**Fix:** restrict to `e.key === "Enter" || e.key === " "` only, and `e.preventDefault()`.

### HIGH-APP-6: `__root.tsx` issues two `getSession` calls per navigation
`apps/app/src/routes/__root.tsx`: both `loader` and `beforeLoad` call `authClient.getSession()`.
Doubles auth round-trips on every route change, increases cold-start latency, and complicates
session error handling.
**Fix:** call once in `beforeLoad`, expose via context, drop the loader version (or vice versa).

### HIGH-APP-7: Portfolio `handleCreate` swallows errors
`apps/app/src/routes/_app.portfolio.index.tsx`: community creation mutation has no `onError`
toast and the optimistic `setQueryData` is never rolled back on failure. UI shows the new
community in the list even when the API rejects.
**Fix:** keep snapshot in `onMutate`, restore in `onError`, and `toast.error`.

### HIGH-APP-8: Portfolio delete + linkCommunity skip critical invalidations
`apps/app/src/routes/_app.portfolio.index.tsx`: `deleteCommunity` does not invalidate the
portfolio rollup; `linkCommunity` does not invalidate `qk.communities.list()`. Stale dashboards
for several seconds to never (until next reload).
**Fix:** invalidate both keys in `onSuccess`.

### HIGH-APP-9: Password change can silently invalidate current session
`apps/app/src/routes/_app.settings.tsx`: `changePassword({ revokeOtherSessions: true })` is fine
in concept, but the success handler does not refetch the current session token. Better Auth may
rotate; the user's next mutation fails with 401 and the global error UI is generic.
**Fix:** `await authClient.getSession()` in `onSuccess`, or call `refetch` on the session hook;
fall through to login if the rotation invalidated the cookie.

### HIGH-APP-10: Reports audit-pack date defaults to UTC midnight
`apps/app/src/routes/_app.reports.audit-pack.tsx`: `periodStart` / `periodEnd` defaults use
`new Date().toISOString().slice(0,10)` derived from UTC, not user TZ. For Pacific users after 4pm
local, the default is "tomorrow," producing reports with off-by-one boundaries. No
`periodStart <= periodEnd` validation either; the form allows inverted ranges.
**Fix:** compute defaults from local-tz date; add cross-field validation in the Zod schema.

### HIGH-APP-11: General ledger query is unbounded
`apps/app/src/routes/_app.reports.general-ledger.tsx`: `useQuery` fetches all entries without
pagination or date-window default. Larger communities (>1 year of activity) hang the route.
**Fix:** require date range (default last 90 days), paginate via cursor or page param.

### HIGH-APP-12: Bank statements account picker shows non-cash accounts
`apps/app/src/routes/_app.bank.statements.tsx`: the Select lists every account regardless of
type. Reconciling against an equity or revenue account is meaningless and produces orphaned
matches in the DB.
**Fix:** filter to `fundType` accounts where `kind in ('bank', 'cash')`.

### HIGH-APP-13: Statement upload component cannot actually upload files
`apps/app/src/components/bank/StatementUpload.tsx`: UI shows a drop zone but only the textarea
CSV-paste path is wired to the mutation. Drop / file-select handlers are stubs.
**Fix:** wire `FileReader` + presigned R2 upload, or remove the drop zone affordance.

### HIGH-APP-14: Governance transitions mutations disable all rows on any pending op
`apps/app/src/routes/_app.governance.transitions.tsx`: single `isPending` from a shared
mutation disables every row's action button while one is in flight, and `onError` is missing
entirely. Looks like the app froze.
**Fix:** per-row pending state (id-keyed Set), per-row `onError` toast.

### HIGH-APP-15: Community switcher doesn't remove queries on switch
`apps/app/src/components/community-switcher.tsx`: sets active community then navigates, but does
not `queryClient.removeQueries` for community-scoped keys. The next route briefly shows previous
community data before refetch.
**Fix:** `queryClient.removeQueries({ predicate: q => q.queryKey.includes(prevCommunityId) })`
or call `queryClient.clear()` if simpler.

### HIGH-APP-16: Cancel-reason modal does not invalidate billing/community queries
`apps/app/src/components/billing/CancelReasonModal.tsx`: on success the modal closes but neither
`qk.billing.subscription(...)` nor `qk.communities.detail(...)` is invalidated. User sees stale
"Active" status.
**Fix:** invalidate both keys in `onSuccess`.

### HIGH-APP-17: `finance.accounts` route claims auto-seed that no longer exists
`apps/app/src/routes/_app.finance.accounts.tsx`: empty state copy says accounts "will be seeded
automatically." Wiring matrix confirms `POST /finance/accounts/seed` is a dead endpoint; the
user is told to wait for something that will never happen.
**Fix:** replace copy with a Create Account CTA and remove the seed reference.

---

## MED

### MED-APP-1: `reset-password.tsx` doesn't sign out before redirecting
`apps/app/src/routes/reset-password.tsx`: post-success navigates to `/login` but doesn't
`authClient.signOut()`. If the user was logged in on another tab the old session lingers.

### MED-APP-2: Forgot-password uses `Skeleton` for loading instead of disabled button
`apps/app/src/routes/forgot-password.tsx`: submit button is replaced with a `<Skeleton />` on
load. Disorienting; standard pattern is `Button disabled` with spinner.

### MED-APP-3: AI CS Support widget recreates session on every navigation
`apps/app/src/routes/_app.dashboard.tsx`: `AiCsSupportWidget` initialises a new session id on
mount instead of persisting via `sessionStorage`. History is lost between routes.

### MED-APP-4: Confirm-action dialog has no destructive variant
`apps/app/src/components/help/ConfirmActionDialog.tsx`: confirm button uses the default variant
even when wrapping destructive ops (delete community, void journal). Users miss the warning cue.

### MED-APP-5: Owner portal route shares the dashboard `handleSignOut` cache-leak pattern
`apps/app/src/routes/owner.tsx`: see HIGH-APP-1; severity dropped because portal sessions are
short-lived and per-token, but the same `queryClient.clear()` gap exists.

### MED-APP-6: Toast deduplication missing on rapid mutation retries
Across `governance/*`, `finance/*`, `billing`: `toast.error(err.message)` can fire multiple
times if the user clicks Submit while the previous request is in flight. `sonner` does not
deduplicate by content.
**Fix:** pass a stable `id` to `toast.error({ id: "create-assessment-error" })`.

### MED-APP-7: Governance violations & arch-requests file upload labels use `rounded-md`
`apps/app/src/routes/_app.governance.violations.tsx:309` and
`apps/app/src/routes/_app.governance.arch-requests.tsx:216`: earlier wave already converted
these; double-check post-merge to ensure they remained `rounded-full` (CLAUDE.md pill rule).

### MED-APP-8: Compliance status badges hard-code English labels
Multiple routes: badges like "Acknowledged", "Pending", "Overdue" are inline strings, not pulled
from a shared i18n table. Acceptable now, but blocks future localization.

### MED-APP-9: Currency formatting inconsistent across routes
`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` is constructed inline in
~12 places. Spec divergence likely on `minimumFractionDigits` for ledger pages.
**Fix:** export `formatUSDCents` from `@boardstack/shared`.

### MED-APP-10: Date formatting inconsistent across routes
Mix of `toLocaleDateString()`, `format(date, 'PP')`, `Intl.DateTimeFormat`. Ledger entries vs
dashboard cards display dates in different formats.

### MED-APP-11: Several routes pull `community.id` from URL without validating ownership
Routes like `_app.finance.journal.entry.$id.tsx`, `_app.governance.arch-requests.$id.tsx`
fetch by id without verifying that id belongs to the currently active community. Server enforces
auth, but UI shows a spinner→empty state instead of "Not Found in this community".

### MED-APP-12: `Sheet`/`Dialog` close on click-outside while mutation pending
Across the app: dialogs close on outside-click even mid-mutation. Submit can resolve into an
unmounted dialog.
**Fix:** `<DialogContent onInteractOutside={(e) => { if (isPending) e.preventDefault(); }}>`.

### MED-APP-13: Combobox empty result shows no "Add new" affordance for homes
`AddHomeownerDialog` is well-built, but the homes Combobox elsewhere (assessments, violations)
returns "No results" without offering to create a home inline.

### MED-APP-14: `Toaster` configured with default duration in `sonner.tsx`
`apps/app/src/components/ui/sonner.tsx`: default 4s; error toasts disappear before a board
member finishes reading.
**Fix:** override `duration` on error variant or pass per-call.

### MED-APP-15: Multi-step onboarding wizard has no "Save & resume later"
`apps/app/src/components/help/OnboardingGuide.tsx`: closing mid-wizard loses progress. Wizard
state lives in `useState`, not persisted.
**Resolved:** `OnboardingGuide` was removed. The dashboard onboarding was consolidated onto the
DB-backed Activation checklist (single source of truth), so there is no mid-wizard state to lose.

### MED-APP-16: Tier-upgrade gate links to `/billing` without preserving deep-link return
`apps/app/src/components/tier-upgrade-gate.tsx`: Upgrade button navigates away; after checkout
user lands back on `/billing` rather than the locked feature.
**Fix:** pass a `?returnTo=` param through Stripe metadata and read it on success page.

### MED-APP-17: Feedback widget renders even on auth routes
`apps/app/src/components/feedback-widget.tsx`: FAB visible on `/login`, `/signup`,
`/forgot-password`. Out of context.
**Fix:** mount inside `_app` layout, not at root.

### MED-APP-18: Reserve-study upload accepts any MIME
`_app.finance.reserves.tsx`: file picker has `accept="*"`. Boards upload screenshots,
Word docs, etc., bloating R2.
**Fix:** restrict to `application/pdf` and label requirement.

### MED-APP-19: Several mutations lack `onError` toast (silent failure)
`_app.governance.transitions.tsx`, `_app.bank.statements.tsx`, parts of
`_app.portfolio.index.tsx`. Listed individually in HIGHs above; meta-finding logged here so the
fix wave catches the long tail.

### MED-APP-20: `useNavigate` redirects on auth-protected routes don't preserve `redirect` param
Some routes navigate to `/login` without `?redirect=` set to current URL. User lands at dashboard
after re-auth instead of returning to the page they were viewing.

### MED-APP-21: `_app.finance.dues.tsx` does not deduplicate identical assessment rows
If the form is double-submitted (no `isPending` disable on row Add buttons), duplicate rows are
queued client-side without warning.

### MED-APP-22: Reports route lacks "export to CSV" mutation invalidation cleanup
`_app.reports.*`: export buttons trigger downloads with no UI feedback; user re-clicks while
the download is preparing.

### MED-APP-23: Skeleton heights don't match real row heights in tables
Most table routes: `<Skeleton className="h-4" />` placeholder vs ~36px real rows. CLS jumps on
first paint.

### MED-APP-24: Optimistic updates throughout `_app.portfolio.index.tsx` lack rollback
`setQueryData` without `onError` restore. (Already cited in HIGH-APP-7; remaining call sites
follow the same anti-pattern.)

---

## LOW

### LOW-APP-1: Inline `aria-label` strings inconsistent ("Open menu" vs "Toggle menu")
Across mobile nav components.

### LOW-APP-2: `__root.tsx` `ErrorBoundary` renders raw `error.message`
Surfaces internal errors to users. Should map to friendly copy.

### LOW-APP-3: `community-switcher` does not show current tier badge
Easy missed-cue for users on the wrong community.

### LOW-APP-4: `_app.billing.tsx` toggle group uses inline `rounded-full` rather than pill via
canonical Button variant: works but drifts from CLAUDE.md guidance to centralize in
`button.tsx`.

### LOW-APP-5: Forgot-password success state shows the email back to user; could leak
existence in shared-screen contexts.

### LOW-APP-6: `_app.close.tsx` "Run close" button missing keyboard focus ring after click.

### LOW-APP-7: `Toaster` position is `top-right`: clips behind the global header on small
viewports.

### LOW-APP-8: `useEffect` in `__root.tsx` posthog init runs even when `VITE_POSTHOG_KEY`
empty (no-ops but adds noise).

### LOW-APP-9: Several `Form` components use `noValidate` on `<form>` without explanation: fine, but a brief comment would prevent future devs reverting it.

### LOW-APP-10: `tier-upgrade-gate` reads `tierAllowsFeature` once on mount; if tier changes
mid-session (admin upgrade in another tab) the gate stays closed until reload.

### LOW-APP-11: File-drop zone help text references "drag and drop" but mobile users cannot.

### LOW-APP-12: Owner portal "Sign out" button styling uses `rounded-md` (pill rule).

### LOW-APP-13: `OnboardingGuide` step indicators not keyboard navigable.
**Resolved:** `OnboardingGuide` was removed during the dashboard onboarding consolidation.

### LOW-APP-14: Several `Select` placeholders read "Select…": vague; specify e.g. "Select an
account".

---

## Files audited (selected)

Routes (all `apps/app/src/routes/**`):
- `__root.tsx`, `_app.tsx`, `owner.tsx`, `owner.index.tsx`, `portal.tsx`
- `login.tsx`, `signup.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- `invitations.$token.accept.tsx`
- `_app.dashboard.tsx`, `_app.settings.tsx`, `_app.billing.tsx`, `_app.close.tsx`
- `_app.portfolio.index.tsx`
- `_app.finance.accounts.tsx`, `_app.finance.dues.tsx`, `_app.finance.reserves.tsx`,
  `_app.finance.journal.*.tsx`
- `_app.bank.reconcile.tsx`, `_app.bank.statements.tsx`
- `_app.governance.transitions.tsx`, `_app.governance.violations.tsx`,
  `_app.governance.arch-requests.tsx`
- `_app.reports.audit-pack.tsx`, `_app.reports.general-ledger.tsx`

Components (selected non-trivial):
- `bank/ReconcileGrid.tsx`, `bank/StatementUpload.tsx`
- `billing/CancelReasonModal.tsx`
- `close/CloseChecklist.tsx`
- `community-switcher.tsx`, `tier-upgrade-gate.tsx`, `feedback-widget.tsx`
- `governance/AddHomeownerDialog.tsx`
- `help/ConfirmActionDialog.tsx`
- `ui/file-drop-zone.tsx`, `ui/sonner.tsx`, `ui/button.tsx`

Auditor: deep-pass general-purpose agent (replaces 2026-05-28 lite-agent "0 defects" result).

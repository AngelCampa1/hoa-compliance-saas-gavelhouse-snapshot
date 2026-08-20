# Phase 1 Foundation -- Code Review

**Reviewer:** Senior Code Review Agent
**Date:** 2026-04-16
**Branch:** worktree-phase-1-foundation
**Commits reviewed:** c4a5695..HEAD (11 commits)

---

## 1. Summary Verdict

**APPROVED WITH MINOR FIXES**

The Phase 1 implementation is architecturally sound and meets the acceptance criteria: a new user can sign up, a community is created automatically, the activation checklist renders, Stripe trial state machine is in place, and Sentry + PostHog are wired up correctly. The test suite is comprehensive and covers the critical paths.

Three issues require fixes before merge: one critical (billing checkout has no membership authorization check), one major (non-atomic inserts in the databaseHook), and two minors. There are no `any` types, no TODO/FIXME/HACK comments, and no placeholder code.

---

## 2. Findings

### CRITICAL

#### C-1: Billing checkout does not verify community membership
**File:** `apps/api/src/routes/billing.ts` lines 28-87
**Description:** `POST /billing/checkout` and `POST /billing/portal` authenticate the session but do not verify that the authenticated user is a member (or owner) of the `communityId` they pass in the request body. Any authenticated user who knows or guesses another community's ID can initiate a checkout session or open a billing portal for that community. This is a cross-tenant authorization bypass.

The route looks up the subscription row only by `communityId` -- it never joins `communityMembers` to confirm the calling user belongs to that community.

**Fix:** Before calling Stripe, add a membership check analogous to the one in `activation.ts`:
```ts
const [membership] = await db
  .select()
  .from(communityMembers)
  .where(
    and(
      eq(communityMembers.communityId, data.communityId),
      eq(communityMembers.userId, session.user.id),
      eq(communityMembers.role, "owner"),
    ),
  )
  .limit(1);
if (!membership) return c.json({ error: "Forbidden" }, 403);
```
The same fix applies to `POST /billing/portal` -- verify `communityId` belongs to the calling user.

---

### MAJOR

#### M-1: databaseHook inserts are sequential and non-atomic
**File:** `apps/api/src/lib/auth.ts` lines 75-100
**Description:** The `user.create.after` hook issues four sequential `await hookDb.insert(...)` calls without a wrapping transaction. If the process crashes or the Worker is evicted between any of those inserts, the user will be left in a partially initialized state (e.g., a user row with no matching subscription or activation row). Better Auth's drizzle adapter exposes `db.transaction(...)` and there is no Cloudflare Workers restriction preventing its use with Hyperdrive/Neon.

**Fix:** Wrap all four inserts in a single transaction:
```ts
await hookDb.transaction(async (tx) => {
  await tx.insert(communities).values({ ... });
  await tx.insert(communityMembers).values({ ... });
  await tx.insert(subscriptions).values({ ... });
  await tx.insert(communityActivation).values({ ... });
});
```

---

### MINOR

#### m-1: `createAuth` is called once per request in middleware, not cached
**Files:** `apps/api/src/routes/communities.ts:27`, `apps/api/src/routes/activation.ts:16`, `apps/api/src/routes/billing.ts:32,98`, `apps/api/src/routes/auth.ts:8`
**Description:** `createAuth(c.env)` is called inside request handlers and middleware on every individual request. `betterAuth(...)` initializes the adapter, builds internal state, and wires the drizzle adapter on each call. In a Cloudflare Worker context the cost is low (no persistent connections survive between requests anyway), but it is semantically incorrect and wastes per-request CPU budget. Better practice is to create the auth instance once per Worker isolate via a module-level singleton factory keyed on env bindings.

**Fix:** Use a module-level WeakMap keyed on env or a simple memoization pattern:
```ts
const authCache = new WeakMap<Env, Auth>();
export function getAuth(env: Env): Auth {
  let auth = authCache.get(env);
  if (!auth) { auth = createAuth(env); authCache.set(env, auth); }
  return auth;
}
```

#### m-2: Stripe webhook has no idempotency guard
**File:** `apps/api/src/routes/billing.ts` lines 122-196
**Description:** The webhook handler processes every incoming event unconditionally. Stripe guarantees at-least-once delivery and will retry on non-2xx responses. If Stripe retries an event (e.g., `checkout.session.completed`) after the Worker timed out mid-write, the handler will attempt to write the same `stripeSubscriptionId` again, which is harmless for `UPDATE` statements but is still a gap against the review criteria ("idempotency on events").

For Phase 1 the practical risk is low because the writes are all idempotent `UPDATE` statements that converge to the same state. This should be noted and tracked, but does not block merge. A proper fix would store `event.id` in a `processed_webhook_events` table and short-circuit on duplicates.

---

### INFORMATIONAL (no fix required)

#### i-1: `communities.state` is required on `createCommunityInput` but nullable in schema
**Files:** `packages/shared/src/schemas/tenancy.ts:18-21`, `apps/api/src/db/schema/tenancy.ts:16`
**Description:** The `POST /communities` route uses `createCommunityInput` which requires `state` (2-letter code). The schema column is `text("state")` (nullable). Signup uses `PATCH /communities/setup` which accepts optional state -- that path is consistent. The `POST /communities` route (for manually creating additional communities) requires state, which is intentional and fine for that path.

#### i-2: `request_received` event fires on every request including health checks
**File:** `apps/api/src/index.ts` lines 37-46
**Description:** Every inbound request fires a server-side PostHog event containing method + pathname. For Phase 1 this is acceptable as a lightweight trace, but as traffic grows this will generate significant PostHog event volume for health check probes. Consider filtering `/health` from this middleware.

#### i-3: `buildAdvancedOptions` checks for `gavelhouse.app` substring, not exact domain
**File:** `apps/api/src/lib/auth.ts` lines 25-37
**Description:** The cookie domain is enabled when `APP_URL` contains the string `gavelhouse.app`. If `APP_URL` were ever set to something like `https://notgavelhouse.app/` this check would correctly not match, and `https://my.gavelhouse.app` correctly matches. The approach is safe for the current domain structure.

#### i-4: `POST /communities` in `communities.ts` creates a second community
**File:** `apps/api/src/routes/communities.ts` lines 45-77
**Description:** The `databaseHook` in `auth.ts` already creates the first community on signup. The `POST /communities` route is available for future multi-community flows but a single-community Phase 1 user who hits this route would get a second community. There is no UI path to this endpoint in the current app routes, so it is not exploitable in practice. It should be documented or gated in Phase 2 when multi-community is intentional.

---

## 3. Positive Observations

**Auth config is clean.** `createAuth` correctly conditionally applies `crossSubDomainCookies` only when `APP_URL` contains `gavelhouse.app`, never in local dev. The `buildAdvancedOptions` abstraction makes the logic easy to test, and there are dedicated tests confirming both production and localhost behavior.

**Stripe webhook signature verification is correct.** `constructEventAsync` is called before any DB write and the raw body (`c.req.text()`) is used rather than the parsed JSON, which is the correct pattern for HMAC verification.

**Observability is properly no-op when env vars are absent.** `initSentry` returns `null` when `SENTRY_DSN` is absent; `captureEvent` short-circuits when `POSTHOG_KEY` is absent; exceptions in the PostHog fetch path are caught and suppressed. The Worker will not crash if observability keys are missing.

**No PII in PostHog events.** The `request_received` event only includes method and pathname. The `captureException` calls do not attach user email or password.

**Tenancy safety on activation routes.** Every `GET /activation` and `PATCH /activation/:step` first verifies the calling user is a member of the requested `communityId` before returning or modifying data.

**Stripe state machine covers all relevant subscription events.** The webhook handler correctly maps `trialing`, `active`, `past_due`, `canceled` from Stripe and catches unknown statuses as `expired`.

**Schema migrations are correct.** Migration `0000` creates `state text NOT NULL`, and `0001` correctly drops the NOT NULL constraint in a separate migration, which is safe for an existing table. The migration approach is clean.

**Test coverage is thorough for the API layer.** All route handlers have dedicated test files with edge cases: 401/403/404 paths, Stripe signature failure, partial updates, invitation expiry, and all four activation steps with both `true` and `false` toggle states. Observability tests verify no-op behavior without env vars.

**No `any` types, no TODO/FIXME/HACK comments, no placeholder code found in `apps/api/src/`.**

**Portfolio tier Contact Sales card renders correctly.** `contactSales: true` on the Portfolio tier is checked in `_app.billing.tsx` and renders a mailto link instead of the Stripe checkout button.

**Signup flow is correct.** The two-step pattern (Better Auth sign-up followed by `PATCH /communities/setup`) correctly separates user creation (with the databaseHook auto-creating the community) from optional community name/state capture.

---

## 4. Required Actions Before Merge

1. **[CRITICAL] Fix C-1**: Add membership authorization to `POST /billing/checkout` and `POST /billing/portal` in `apps/api/src/routes/billing.ts`. Add corresponding test cases for the 403 path.

2. **[MAJOR] Fix M-1**: Wrap the four sequential inserts in `apps/api/src/lib/auth.ts` `databaseHooks.user.create.after` in a single `hookDb.transaction(...)` call. Update the auth test that asserts 4 insert calls to account for the transaction wrapper.

3. **[MINOR] Address m-1**: Memoize `createAuth` per Worker isolate to avoid re-initializing Better Auth on every request.

Items i-1 through i-4 are informational and do not require changes before merge.

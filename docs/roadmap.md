# Gavelhouse -- Build Roadmap

## Product context

Gavelhouse (gavelhouse.app) is a compliance-first HOA/condo management SaaS for
self-managed volunteer boards.

- **Value prop:** true fund accounting + reserve compliance + state-specific
  requirements, built for volunteer boards (not property managers).
- **Pricing:** flat $59 / $165 / $299 monthly, or $49 / $135 / $249
  effective monthly when billed annually. Portfolio is custom.
- **Motion:** self-serve checkout, Y80OFF limited offer, 30-day money-back
  guarantee, no per-unit fees, board-approvable.
- **Compliance tailwind:** Fannie Mae LL-2026-03 raises reserve allocation
  requirement from 10% -> 15%, effective Jan 2027. Hard external deadline to
  market against.

---

## Phase status

| Phase | What | Status |
|-------|------|--------|
| **0** | Repo scaffold + validation site migration | Done Done |
| **1** | Auth, tenancy, Stripe billing, trial state machine | Done Done |
| **2** | True fund accounting core (the moat) | Done Done |
| **3** | Governance workflows (Growth tier) | Done Done |
| **4** | Reporting, audit pack, portfolio tier | Done Done |

---

## Phase 0 -- Scaffolding Done

Completed. Landed on `master` in 8 commits.

**What shipped:**
- pnpm/Turborepo monorepo: `@boardstack/{app,api,web,shared}`
- `apps/app` -- React 19 + Vite stub (port 3060)
- `apps/api` -- Hono Worker stub (port 8060), waitlist stub routes
- `apps/web` -- Astro 5 marketing site, migrated from `ideas-validation/sites/boardstack`
  (150+ pSEO pages, React islands wired to `apps/api` via `PUBLIC_API_URL`)
- `packages/shared` -- brand constants, pricing tiers, competitor data
- Pre-commit hooks: lint-staged + affected-package checks (only runs on changed packages)
- `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` (10 plugins)
- `docs/infra-bootstrap.md` -- provisioning checklist (Cloudflare, Neon, Stripe, Resend, Sentry, PostHog)
- `.github/workflows/ci.yml` -- CI on push/PR to master

**Prerequisite before Phase 1:** complete `docs/infra-bootstrap.md` (Neon connection string + Stripe keys at minimum).

---

## Phase 1 -- Foundation: auth, tenancy, billing

**Worktree:** `.claude/worktrees/phase-1-foundation`
**Touches:** `apps/api/**`, `packages/shared/auth,billing,tenancy`, `apps/app/src/routes/auth/**`
**Depends on:** Phase 0 Done
**Blocks:** Phase 3

### Tasks

1. **Better Auth** -- email/password + Google OAuth in `apps/api`. Session cookie on `.gavelhouse.app`.
2. **Drizzle schema -- core tenancy** -- `users`, `communities`, `community_members`
   (roles: owner/admin/treasurer/secretary/viewer), `invitations`. Migration against Neon.
3. **Community switcher** -- contract in `packages/shared` + `apps/app` header dropdown.
4. **Stripe Checkout + portal** -- three checkout tiers: Starter, Growth, and Scale. Portfolio is custom.
   Webhook handler at `apps/api/src/routes/billing/webhook.ts` with signature verification.
   Subscription state on `communities`.
5. **30-day trial state machine** -- trial starts on community creation. Activation checklist
   (roster imported, reserve dashboard populated, compliance check acknowledged, dues batch configured)
   in `community_activation` table.
6. **Sentry + PostHog SDK** -- wired on `apps/app` and `apps/api`.
7. **Marketing wiring** -- pricing page, trial signup form -> `apps/api`, legal pages (ToS/privacy/DPA stubs).

**Done when:** new user signs up -> creates community -> sees activation checklist -> starts Stripe trial
-> lands in empty dashboard shell with Sentry + PostHog events firing.

---

## Phase 2 -- True fund accounting (the moat)

**Worktree:** `.claude/worktrees/phase-2-accounting`
**Touches:** `apps/api/src/domain/accounting/**`, `packages/shared/accounting`, `apps/app/src/routes/finance/**`
**Depends on:** Phase 1 (`communities` table)
**Blocks:** Phase 4
**Runs in parallel with:** Phase 3

This is Gavelhouse's core differentiation. The whole positioning rests on "QuickBooks can't do this."

### Tasks

1. **Chart of accounts** -- every account tagged `operating` OR `reserve` (non-nullable enum).
   Enforced in Drizzle schema + Zod.
2. **Double-entry ledger** -- `journal_entries` + `journal_lines`. Lines must balance per-fund
   (not just globally). Transaction wrapper rejects commingling. This is the anti-commingling guarantee.
3. **Reserve fund dashboard** -- balance by component, % funded vs reserve study baseline,
   Fannie Mae 15% check (flag if below threshold).
4. **Reserve study import** -- CSV + JSON importer: components -> useful life -> replacement cost -> current reserve.
5. **Dues + payments** -- `homeowners`, `units`, `assessments`, `payments`.
   Stripe ACH + card for HOA dues collection (separate from Gavelhouse subscription billing).
6. **State compliance rule table** -- static TS module in `packages/shared/compliance/` seeded from
   `ideas-validation/sites/boardstack/docs/U.S. state HOA reserve fund requirements a 50-state breakdown.md`.
   Queried by dashboard to surface state-specific alerts + statute links.
7. **Audit log** -- append-only `audit_events` table for every write in the accounting domain.

**Done when:** treasurer imports reserve study -> records journal entry (within operating) -> attempts
to commingle -> gets rejected with clear error -> sees reserve dashboard with Fannie Mae compliance status.

---

## Phase 3 -- Governance workflows (Growth tier)

**Worktree:** `.claude/worktrees/phase-3-governance`
**Touches:** `apps/api/src/domain/governance/**`, `apps/app/src/routes/governance/**`, `packages/shared/governance`
**Depends on:** Phase 1 (auth + communities)
**Runs in parallel with:** Phase 2 and Phase 4

### Tasks

1. **Homeowner directory** + roster CSV import.
2. **Owner portal** -- separate low-privilege auth surface (email invite, no account friction).
   View balance, pay dues, submit architectural requests, view documents.
3. **Violation log** -- workflow: open -> cured -> closed. Photo upload to R2.
4. **Architectural request tracking** -- submission form, board review queue, decision + audit trail.
5. **Board minutes + votes** -- meeting records, motion tracking, per-director vote capture.
6. **Automated dues reminders** -- scheduled Worker cron job, Resend emails for overdue assessments.
7. **Board transition mode** -- guided checklist when treasurer/secretary role reassigns; forces
   handoff of pending items. Key retention lever (prevents churn from board turnover).

**Done when:** Growth-tier community runs full meeting -> motion -> vote -> minutes -> architectural
decision cycle end-to-end with all actions in the audit log.

---

## Phase 4 -- Reporting, audit pack, portfolio (Scale + Portfolio tiers)

**Worktree:** `.claude/worktrees/phase-4-reporting`
**Touches:** `apps/api/src/domain/reporting/**`, `apps/app/src/routes/reports/**`
**Depends on:** Phase 2 (ledger is the data source)
**Runs in parallel with:** Phase 3

### Tasks

1. **Full general ledger report** -- trial balance, balance sheet, income statement, all fund-segregated.
2. **Audit-ready export pack** -- one-click zip: GL, bank recs, reserve study snapshot, meeting minutes,
   compliance attestations as PDF + CSV. Scale tier headline feature.
3. **Month-end close template** -- checklist workflow that auto-generates the export pack on completion.
4. **Multi-community view** (Scale) + **portfolio dashboard** (Portfolio) -- cross-community roll-ups,
   consolidated reserve health, portfolio-wide compliance alerts.
5. **Role handoff reports** for board transition mode.
6. **Reason-coded churn** -- cancellation modal captures reason code -> PostHog event.

**Done when:** Scale admin runs month-end close + downloads audit pack; Portfolio operator sees all
communities' reserve health in one dashboard.

---

## Parallelization rules

Phases 1-4 each live in their own worktree. They can run concurrently after Phase 1's `communities`
table lands, because they touch disjoint directories. One shared surface:

- **`packages/shared`** -- append-only across all phases. Add new schemas/types; never rewrite existing ones.
- **Shared contract first** -- any phase needing a new shared type adds it in a tiny prep PR before the main work.
- **Merge order** -- any order works; suggested production rollout: 1 -> 2 -> 3 -> 4.

---

## Verification checklist (every phase)

- [ ] `pnpm run verify` -- lint + typecheck + 95% per-file coverage on every touched file
- [ ] `pnpm exec turbo build` -- every app builds clean
- [ ] Dev servers start on correct ports (3060/3061/8060) with no warnings
- [ ] Playwright smoke test walks the golden path in a real browser
- [ ] Reviewer subagent (`superpowers:requesting-code-review`) approves -- all findings fixed
- [ ] Sentry + PostHog events visible in dashboards (document in PR)
- [ ] Worktree and branch torn down after merge

---

## Critical shared files

| File | Owner | Rule |
|------|-------|------|
| `CLAUDE.md` | All | Update when stack or commands change |
| `AGENTS.md` | All | Rarely changes after Phase 0 |
| `packages/shared/src/index.ts` | All | Append only -- never rewrite |
| `apps/api/src/index.ts` | All | Each phase adds a domain sub-router; never edits existing routes |
| `apps/app/src/routes/__root.tsx` | Phase 1 only | Later phases add file-based routes |
| `docs/superpowers/plans/YYYY-MM-DD-phase-N.md` | Per phase | Written by `superpowers:writing-plans` at phase start |

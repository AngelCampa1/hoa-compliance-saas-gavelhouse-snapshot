# CLAUDE.md — Gavelhouse

> **Status: shut down.** Gavelhouse was wound down on 2026-06-11 and this
> repository is a published snapshot, not a live product. The Cloudflare Workers
> are dead behind a kill switch, the live URLs are gone, and there is no remote
> to pull from or deploy to. Everything below is kept as it was written, because
> it is part of the engineering record — it is how the product was actually
> built. Read the deploy, branding, and operations sections as a description of
> what the workflow was, not as instructions to run today.

## Before Starting Work

This file described how Claude Code worked in this repository while Gavelhouse
was being built. Work was pulled from a shared remote first (`git pull`), since
the repository was developed across several machines. The snapshot has no
remote, so there is nothing to pull.

## LinkedIn/Postiz Review Gate

Before creating, uploading, or scheduling LinkedIn posts through Postiz, run `node scripts/lint-linkedin-posts.mjs` and keep `scripts/postiz-upload.mjs` on its built-in review gate. Do not publish posts that contain internal production labels such as "new lead magnet", image suggestions/descriptions without an actual attached image, TODO/TBD placeholders, generic AI phrasing, or claims that were not checked against repo source material.

## Current Workflow Overrides

- Feature work and larger scoped tasks must use a worktree under `.claude/worktrees/<branch>`. Small, quick bug fixes may be done directly on `master`.
- For any work done in a worktree, completion requires: run a dedicated review agent against all work in that worktree, fix every issue found, merge the worktree back to `master`, remove the worktree and its branch, then deploy every touched project to its explicit Cloudflare resource.
- Deploy API changes to Worker `boardstack-api`, dashboard changes to Worker `boardstack-app`, and marketing changes to Worker `boardstack-web`.
- Cloudflare must have only one production Gavelhouse marketing site: `boardstack-web`. Remove or disable stale marketing Pages projects, including any old `ideas-validation`-backed project.
- These overrides supersede older workflow language below that says all work must happen outside `master`.

### Deploy canonical commands

These were the deploy commands while the product was live. They no longer point
at anything: the three Workers are shut down and the commands would fail at
preflight without a remote.

- `pnpm --filter @boardstack/api run deploy` — Worker `boardstack-api`
- `pnpm --filter @boardstack/app run deploy` — Worker `boardstack-app`
- `pnpm --filter @boardstack/web run deploy` — Worker `boardstack-web`
- `pnpm run deploy:touched` — orchestrator that auto-selects projects based on `origin/master...HEAD`.

Never invoke `wrangler` directly from the terminal — no hook or guard catches
that; the `check-no-raw-wrangler` guard only blocks raw wrangler calls that get
added to `package.json` scripts. If a deploy is needed, run one of the canonical
commands above. Each `deploy` script runs preflight (asserts master + clean tree

- synced with origin), injects `BUILD_COMMIT`, deploys to the explicit Worker,
  then self-verifies the live URL is serving that commit. A raw
  `wrangler deploy` call bypasses every guardrail.

## Rebrand Guard

Gavelhouse is the public product name and `gavelhouse.app` is the public
domain. Do not revive `Pebbledesk`, `PebbleDesk`, `pebbledesk`, or any
`pebbledesk.*` domain in code, content, docs, screenshots, generated artifacts,
social posts, email templates, metadata, or Cloudflare routing.

Do not reintroduce `BoardStack`, `Boardstack`, `boardstack.app`,
`my.boardstack.app`, `api.boardstack.app`, `www.boardstack.app`,
`*.boardstack.*`, `@boardstackhq`, `boardstack-vs-*`, `*-vs-boardstack`, or
other `boardstack*` public brand references. Existing internal identifiers such
as `@boardstack/*` package names, workspace filters, database names, R2 buckets,
and Cloudflare resources (`boardstack-api`, `boardstack-app`,
`boardstack-web`) are intentionally retained until an explicit infrastructure
migration is requested.

One intentional exception exists for `boardstack.app`/`www.boardstack.app`: the
`boardstack-web` Worker routes those hostnames solely to issue a permanent
(301) redirect to `gavelhouse.app`. This is a redirect, never a mirror — the
retired domain must never serve marketing content. The redirect lives in
`apps/web/src/lib/worker-wrapper.ts`, `apps/web/src/middleware.ts`, and the
`boardstack.app` routes in `apps/web/wrangler.toml` (all whitelisted in the
public-facts guard's `LEGACY_REDIRECT_PATHS`). Do not remove this redirect.

Before completing any change that touches public text, branding, marketing,
routing, SEO, social posts, email templates, metadata, screenshots, generated
artifacts, documentation, or deployment configuration, search for old public
names and domains and confirm that remaining `boardstack*` matches are internal
operational identifiers only.

## Project Overview

**Gavelhouse** (gavelhouse.app) was a compliance-first HOA/condo management SaaS for self-managed volunteer boards. It shut down on 2026-06-11; the domain no longer serves the product.
Positioning while it ran: reserve fund compliance + personal liability protection + state-specific requirements.
Flat per-community pricing by size band (Starter ≤50 homes, Growth 51–200, Scale 201–500, Portfolio for multi-community operators), with no per-unit fees. Annual plans carry the Y80OFF limited offer (80% off your first year) and a 30-day money-back guarantee. Canonical prices, limited subscription offers, and the guarantee live in `@boardstack/shared` (`KNOWLEDGE_PRICING_PLANS`, `KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER`, `GUARANTEE_CONFIG`) — never hardcode pricing in copy; it is enforced by `gavelhouse-pricing-content-audit.test.ts`.

The product application code lives in this repo. The validation/marketing research formerly at `ideas-validation/sites/boardstack` was migrated here as `apps/web`.

## Monorepo Structure

- `apps/app` — React 19 + Vite + TanStack Router dashboard SPA (my.gavelhouse.app). Deployed to Cloudflare Workers.
- `apps/api` — Hono on Cloudflare Workers (api.gavelhouse.app). Drizzle ORM + Neon Postgres via Hyperdrive. Better Auth.
- `apps/web` — Astro 5 public marketing site (gavelhouse.app). Deployed to Cloudflare Workers.
- `packages/shared` — Zod schemas, constants, TypeScript types, compliance rule tables shared across all apps.
- `scripts/` — repo automation (run-affected-checks, seed scripts).
- `docs/` — roadmap, plans, design notes.

Package names: `@boardstack/app`, `@boardstack/api`, `@boardstack/web`, `@boardstack/shared`.

## Local Dev Ports (cross-project, do not change)

Reserved per-project so multiple repos can run side-by-side without collisions.

| Project    | Frontend                | Backend |
| ---------- | ----------------------- | ------- |
| Kaiplan    | 3030                    | 5030    |
| Gavelhouse | 3040                    | 5040    |
| Grantpipe  | 3050                    | 5050    |
| Gavelhouse | 3060 (app) / 3061 (web) | 8060    |

- `apps/app` dashboard: port 3060
- `apps/web` marketing site: port 3061
- `apps/api` Worker: port 8060 (changed from 5060 — Chrome blocks port 5060 as unsafe SIP port, preventing browser-based local testing)

Never fall back to 3000/8787 defaults.

## Database Environment

The Neon `DATABASE_URL` for Drizzle migrations is stored locally in the
gitignored root `.env` file. Do not commit the value. Before running
`pnpm --filter @boardstack/api run db:migrate`, load `DATABASE_URL` from
`.env` into the shell environment.

## Production QA Credentials

There is no production left to test against; this section describes how live QA
was set up while it ran. No credential was ever committed, and none is in this
snapshot.

Production E2E QA credentials were stored locally in the gitignored root
`.env` file under `LIVE_E2E_*` variable names. Do not commit these values or
paste them into tracked docs, screenshots, traces, or bug reports.

The dedicated production QA owner account for focused live testing was stored
under `LIVE_E2E_QA_EMAIL`, `LIVE_E2E_QA_PASSWORD`, `LIVE_E2E_QA_NAME`,
`LIVE_E2E_QA_COMMUNITY`, and `LIVE_E2E_QA_CREATED_AT`. The existing
`LIVE_E2E_EMAIL`, `LIVE_E2E_NAME`, and `LIVE_E2E_COMMUNITY` aliases point to
the same account for older live smoke specs.

## Tech Stack

- **Frontend (app):** React 19, Vite, TanStack Router (file-based), TanStack Query, Shadcn/UI (New York style), Tailwind CSS 4, Lucide React
- **Backend (api):** Hono, Better Auth (email/password + Google OAuth), Drizzle ORM, Neon Postgres via Cloudflare Hyperdrive
- **Marketing (web):** Astro 5 with Cloudflare adapter, React islands, Tailwind CSS 4
- **Infrastructure:** Cloudflare Workers, Cloudflare Pages, Cloudflare Hyperdrive, Cloudflare R2
- **Payments:** Stripe (subscription billing for Gavelhouse tiers + Stripe ACH/card for HOA dues collection)
- **Email:** Resend + React Email
- **Analytics:** PostHog
- **Error tracking:** Sentry
- **Tooling:** pnpm workspaces, Turborepo, TypeScript

## Commands

```bash
pnpm install                              # Install all dependencies
pnpm exec turbo build                     # Build all packages
pnpm exec turbo dev                       # Dev all packages
pnpm run lint                             # Run ESLint across workspace
pnpm run typecheck                        # Typecheck all packages
pnpm run test:coverage                    # Run coverage gates across workspace
pnpm run verify                           # Full local quality gate (lint + typecheck + test:coverage)

pnpm --filter @boardstack/app dev         # Dashboard SPA on :3060
pnpm --filter @boardstack/web dev         # Marketing site on :3061
pnpm --filter @boardstack/api dev         # API Worker on :8060

pnpm --filter @boardstack/api run db:generate    # Generate Drizzle migration
pnpm --filter @boardstack/api run db:migrate     # Apply migration to Neon
```

## Required env before production

The following environment bindings ship with placeholder values that are acceptable for local dev and tests but MUST be set to real values before any production deploy. These are enforced at runtime (the server will refuse to send, or will fail fast) rather than silently shipping bad data:

- `apps/api` — `COMPANY_POSTAL_ADDRESS` must be set to the real registered business address. The lead-magnet nurture mailer throws if this env var is missing; Gavelhouse's wrangler.toml currently holds the literal string `"Gavelhouse, [set COMPANY_POSTAL_ADDRESS in production]"` so tests pass, but CAN-SPAM compliance requires a real postal address in production emails.
- `apps/web` — `PUBLIC_API_URL` must be set in the marketing site build environment so lead-magnet subscribe forms POST to `api.gavelhouse.app` (not to the marketing origin). The `lead-magnet-page.astro` layout throws at build time when this is missing.

## Brand & Messaging Guidelines

- **Audience:** Volunteer HOA board members (treasurers, presidents, secretaries) running self-managed communities up to 500 units.
- **Voice:** Compliance-focused. Lead with liability risk and state-specific requirements.
- **Lead with:** Reserve fund compliance, personal liability protection, state-specific reserve requirements.
- **Anti-QuickBooks positioning:** QuickBooks cannot separate operating and reserve funds (commingling). Gavelhouse enforces this at the DB layer.
- **B2B copy rule:** Lead with compliance risk and fiduciary duty, not emotion/FOMO.
- **Price anchor:** $10-$50/mo with Y80OFF when billed annually,
  or $49-$249/mo billed annually before promo. No per-unit fees.
- Do not claim HOA/real estate/property management domain expertise — write from the builder perspective ("we built Gavelhouse because...").
- Never fabricate testimonials, user counts, or waitlist numbers. Omit social proof rather than inventing it.

## Workflow

This was the working agreement while the product was live. The deploy steps in
it no longer apply — there is nothing left to deploy to.

- **Worktree default for larger work** — feature work and larger scoped tasks must be done in a worktree under `.claude/worktrees/<branch>`. Small, quick bug fixes may be done directly on `master`.
- **Sub-agent-first workflow is required** — use fresh subagents for bounded codebase exploration, implementation plan execution, review passes, and follow-up fixes.
- **Controller context must stay small** — coordinate and integrate; delegate scoped work to subagents.
- **Execute every task end-to-end** — complete the full plan unless a real blocker is hit.
- **All quality gates are mandatory** — tests, coverage, linting, typechecking must pass before work is considered done.
- **Reviewer agent is mandatory** — every implemented change must be reviewed by a dedicated review agent, and every issue must be fixed before completion.
- **Merge is part of done for worktrees** — after implementation, verification, and review complete in a worktree, merge the worktree back to `master`.
- **Cleanup is required after worktree merge** — once merged, tear down the worktree: (1) kill any dev servers, (2) `git worktree remove .claude/worktrees/<name>`, (3) `git branch -d worktree-<name>`, (4) confirm with `git worktree list`.
- **Deploy touched projects after completion** — deploy every touched project to its explicit Cloudflare resource: `boardstack-api` for API, `boardstack-app` for the dashboard, and `boardstack-web` for the marketing site.
- **One marketing site only** — Cloudflare must have a single production Gavelhouse marketing site, `boardstack-web`. Remove or disable stale marketing Pages projects, including any old `ideas-validation`-backed project.

## UI Standards (canonical)

- **Buttons are pills.** All interactive button surfaces in `apps/app` and `apps/web` must use fully-rounded (`rounded-full`) corners. This applies to Shadcn `Button` variants, native `<button>` elements styled with our utility classes, marketing CTAs in Astro, link-buttons (`<a>` styled as a button), icon buttons, and toggle groups. Square or `rounded-md`/`rounded-lg` button shapes are not permitted. Form inputs, cards, dialogs, popovers, and tags are NOT buttons and keep their existing radii.
- The canonical implementation lives in the Shadcn `Button` component (`apps/app/src/components/ui/button.tsx`) — update the base variant there rather than overriding per-call-site. Audit one-off button styles to align.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing.
- **No `eslint-disable` without explanation.** Fix the lint error instead.

### Test-Driven Development (TDD) — MANDATORY

Every task follows this cycle. No exceptions:

1. Write the failing test first.
2. Run the test. Confirm it fails.
3. Write the minimal implementation to make the test pass.
4. Run the test. Confirm it passes.
5. Refactor if needed; re-run tests.

### Coverage Requirements

- **95% code coverage minimum on every file you touch.** Not the repo average — each individual file.
- React route components (`.tsx` files in `routes/`) are excluded.
- Astro page files under `apps/web/src/pages/**/*.astro` are excluded.

## Pre-Commit Hooks

Two-layer smart hook system:

1. **lint-staged** (file-level) — ESLint `--fix` + Prettier `--write` on staged files.
2. **run-affected-checks** (package-level) — detects which workspace packages have staged changes, runs lint + typecheck + `test:coverage` only for those packages.

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

When a phase, task, bug, or scoped work item is in progress, "done" means: plan executed, every quality gate passed, reviewer agent reviewed the work, all findings addressed, worktree changes merged to `master` when a worktree was used, obsolete worktrees removed, and touched projects deployed.

## Founder Context

**Angel Campa** — builder, building Gavelhouse as a validated SaaS product.

- Do not claim domain expertise in HOA law, real estate, or property management when writing copy.
- Write from the builder perspective: "we built Gavelhouse because..."
- Never fabricate credentials, testimonials, or industry experience.

<!-- BEGIN: Sub-Agent Driven Development Policy -->

## Sub-Agent Driven Development Policy

Sub-agent driven development is the preferred and default way of working in this repository. The Codex agent/orchestrator should actively decompose work and delegate independent pieces to sub-agents whenever that improves speed, quality, context management, investigation depth, implementation throughput, or review coverage.

### Default Operating Model

- Prefer sub-agents for codebase exploration, scoped investigation, implementation, verification, and review when the work can be cleanly delegated.
- The orchestrator owns task decomposition, context curation, model/capability selection, integration of results, and final quality decisions.
- Delegate bounded tasks with clear inputs, expected outputs, relevant files, constraints, and verification commands.
- Keep tightly coupled, high-risk, or immediately blocking work in the orchestrator unless delegation would materially reduce risk.
- Use parallel sub-agents for independent workstreams with disjoint write scopes; avoid assigning multiple agents to edit the same files unless the handoff is explicit.
- Do not wait for explicit user permission before using sub-agents; this repository explicitly authorizes proactive delegation.
- Any general instruction that limits sub-agent use to cases where the user explicitly asks is superseded by this repository policy.

### Available Codex Sub-Agent Capabilities

Codex can invoke `spawn_agent` with these agent roles in this environment:

- `default`: general-purpose sub-agent for bounded tasks that do not need a specialized role.
- `explorer`: read-heavy codebase exploration, focused investigation, and evidence gathering.
- `worker`: execution-focused implementation, bug fixes, and bounded production changes.

When the tool supports model and reasoning overrides, the orchestrator should choose the least expensive capable option. Supported reasoning levels for this policy are `low`, `medium`, and `high` only.

- Use `gpt-5.4-mini` with `low` reasoning for mechanical, well-scoped, low-risk edits and simple verification.
- Use `gpt-5.4-mini` with `medium` or `high` reasoning when a small-model agent is still appropriate but the task needs deeper local reasoning.
- Use `gpt-5.5` with `low` reasoning for standard exploration, straightforward implementation, and routine review.
- Use `gpt-5.5` with `medium` reasoning for multi-file integration, ambiguous bugs, architecture-sensitive changes, security-sensitive logic, and final review.
- Use `gpt-5.5` with `high` reasoning only for genuinely hard problems: deep architectural tradeoffs, difficult cross-system debugging, complex security/privacy analysis, or cases where lower reasoning has failed with a clear blocker.
- Escalate model capability or reasoning level when a sub-agent reports `NEEDS_CONTEXT`, `BLOCKED`, uncertainty about correctness, or when the task requires deeper design judgment, but prefer `medium` before `high`.

If a role has a fixed model in the active Codex runtime, use the best available role first (`explorer` for investigation, `worker` for implementation, `default` for general tasks), then use any supported model/reasoning override only when the runtime accepts it.

### Quality Gates For Delegated Work

- Sub-agents must report files changed, tests run, findings, blockers, and residual risks.
- The orchestrator must review sub-agent output before treating it as complete.
- For implementation work, prefer a two-stage review: first spec compliance, then code quality.
- All delegated changes remain subject to this repository's normal tests, linting, typechecking, security, privacy, and deployment rules.
<!-- END: Sub-Agent Driven Development Policy -->

## AI Agent Orchestration

AI agent instances operating in this repository are orchestrators. They must delegate exploration, implementation, verification, and other execution work to sub-agents whenever the work can be cleanly scoped, preserving the orchestrator's context window for coordination, integration, and final judgment.

## Required marketing copy pass

For this repo, all marketing copy must pass through both writing checks before completion:

1. Use the `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Use the `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level.

This applies to landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social copy, SEO pages, and user-facing UI text that sells, explains, persuades, activates, or reassures.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.

<!-- BEGIN: User-Facing Copy Guardrails -->
## User-Facing Copy Guardrails

For any user-facing copy in this repo, run the copy through these guardrails before you call the work done. This applies to product UI text, landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social posts, SEO pages, help text, empty states, reassurance text, and any copy that sells, explains, persuades, activates, or reassures.

Required order:

1. Run the globally installed `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Run the globally installed `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level. The source package for this skill lives in a shared internal package repository; if the global skill is missing or stale, reinstall or sync it from there before finalizing copy.
3. Verify there are zero lies: no made-up numbers, claims, proof, testimonials, guarantees, rankings, integrations, prices, timelines, or capabilities. Check claims against the product source of truth before publishing.
4. Verify the message fits the whole place it appears: the page, flow, audience, offer, brand voice, surrounding copy, and user intent. Do not approve a line just because it is clear in isolation.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.
<!-- END: User-Facing Copy Guardrails -->

## Working autonomously
- **Poll, don't idle.** When a task, build, test run, or hook is running, actively poll its status and output until it finishes. Don't just sit and wait passively for it to return.
- **Keep going.** When working toward a goal, finishing one chunk of work means moving straight to the next chunk. Don't stop and wait for further input mid-goal — continue until the goal is done or you are genuinely blocked.
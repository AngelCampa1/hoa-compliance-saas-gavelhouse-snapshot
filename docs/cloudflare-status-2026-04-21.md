# Cloudflare Status - 2026-04-21

> Superseded: this historical Pages migration snapshot is no longer the
> operating policy. Gavelhouse marketing production is Worker-only on
> `boardstack-web`. Use `docs/production-operator-guide.md` and the deploy
> preflight scripts for current Cloudflare checks before any deploy.

> Historical note: this file records the 2026-04-21 migration state. The
> current production target for the Gavelhouse marketing site is the
> Worker `boardstack-web`; the old `boardstack` Pages project bound to
> `ideas-validation` was removed on 2026-04-23 after
> `gavelhouse.app` and `www.gavelhouse.app` were confirmed on the replacement
> deployment. Pages Git auto-deploys are disabled; deploy with the repo
> Wrangler scripts.

This document records the production Cloudflare state validated from the
`angel.campa@gavelhouse.app` account on 2026-04-21 using native Wrangler.

## Historical actions captured on 2026-04-21

- Created Pages project `boardstack-app`.
- Created Pages project `boardstack-web`.
- Created R2 bucket `boardstack-governance`.
- Created R2 bucket `boardstack-governance-preview`.
- Created R2 bucket `boardstack-audit-packs`.
- Created R2 bucket `boardstack-audit-packs-preview`.
- Deployed the dashboard frontend to `https://789cb4c1.boardstack-app.pages.dev`.
- Deployed the current marketing site commit (`c718ceb`) to the existing
  production Pages project `boardstack` on branch `master`.
- Added git remote `origin` -> the private GitHub repository.
- Pushed `master` to GitHub and set upstream tracking.

## Historical public state verified

- `https://gavelhouse.app` is live and now reflects the current repository
  copy:
  - 30-day trial
  - billing details required
  - legal footer updated to `Ventora Labs C Corp`
  - cookie notice present
  - legal pages and subprocessors page present
- `boardstack` was the active production Pages project serving
  `gavelhouse.app` at the time this status was captured, but it is now treated
  as stale because it is bound to `ideas-validation`.

## Current policy

Do not use this snapshot as a source of current Cloudflare blockers. Gavelhouse
now deploys production through explicit Worker targets:

- `boardstack-api` for `apps/api`
- `boardstack-app` for `apps/app`
- `boardstack-web` for `apps/web`

The deploy preflight scripts enforce stale Pages-project checks and required
runtime migration placement. Use `docs/production-operator-guide.md` plus
`pnpm run deploy:touched -- --from <base-ref>` for current operations.

## Historical next manual steps

The original manual checklist from this snapshot is intentionally omitted here
because it described a Pages-based migration path that is no longer valid.
Use `docs/production-operator-guide.md` for current Worker deploy operations
and custom-domain checks.

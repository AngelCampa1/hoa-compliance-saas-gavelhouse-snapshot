# Agent Notes

Production E2E QA credentials are stored in the gitignored repository root
`.env` file under `LIVE_E2E_*` variable names. Do not commit credential values
or include production emails, passwords, cookies, or tokens in tracked files.

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

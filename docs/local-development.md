# Local development

This guide gets a freshly cloned copy of this repo running on your machine.

Gavelhouse is shut down. This guide sets up a **local-only** development
environment against a local Postgres database. It does not connect to
production, and it cannot connect to production: no live credentials are
included in this repo, and the hosted product is offline.

## Prerequisites

- **Node.js 22**: see `.nvmrc` at the repo root. If you use `nvm`, run `nvm use`.
- **pnpm 10.33.0**: pinned in the root `package.json` under `packageManager`.
  If you use Corepack, run `corepack enable` and Corepack will pick up this
  exact version automatically.
- **Docker Desktop** (or another Docker Engine + Compose install): used to
  run a local Postgres 16 container. Docker must be running before you run
  the bootstrap script.

## 1. Install dependencies

```bash
pnpm install
```

## 2. Copy environment files

Each app reads its config from a local, gitignored env file. Copy the
committed examples:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/app/.env.example apps/app/.env
cp apps/web/.env.example apps/web/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
Copy-Item apps/app/.env.example apps/app/.env
Copy-Item apps/web/.env.example apps/web/.env
```

The example files already point at the local Postgres container and local
app ports set up in the next step. Every other value (Stripe, Resend, Google
OAuth, Sentry, PostHog) ships blank or with a placeholder: see
[Optional integrations](#optional-integrations-stripe-resend-google-sentry-posthog)
below.

## 3. Start Postgres and run migrations

```bash
pnpm run dev:bootstrap
```

This script:

1. Detects whether you have Docker Compose v2 (`docker compose`) or the
   legacy v1 binary (`docker-compose`) and uses whichever is available.
2. Starts a `postgres:16-alpine` container defined in the root
   `docker-compose.yml`, published on `127.0.0.1:55460` (mapped to the
   container's `5432`), with a named volume so data survives restarts.
3. Polls the container with `pg_isready` until Postgres accepts connections,
   or fails with a clear error after a bounded number of attempts.
4. Runs Drizzle migrations (`pnpm --filter @boardstack/api run db:migrate`)
   against that database, applying every migration under
   `apps/api/migrations`.

It does not start any app servers and does not seed data: that is a
separate, explicit step so the bootstrap script stays fast and predictable.

## 4. Start the apps

```bash
pnpm dev
```

This runs Turborepo's `dev` pipeline for all three apps at once:

| App                         | URL                   |
| --------------------------- | --------------------- |
| `apps/app` (dashboard SPA)  | http://localhost:3060 |
| `apps/web` (marketing site) | http://localhost:3061 |
| `apps/api` (Worker API)     | http://localhost:8060 |

Leave this running in its own terminal.

## 5. Seed demo data

With the API running (step 4), open a **second terminal** and run:

```bash
pnpm --filter @boardstack/api run seed:demo
```

This creates three demo accounts you can sign in with at
http://localhost:3060:

| Email                           | Password    | Tier      | What it shows                               |
| ------------------------------- | ----------- | --------- | ------------------------------------------- |
| `treasurer@test.gavelhouse.app` | `Test1234!` | Scale     | A fully populated single community          |
| `portfolio@test.gavelhouse.app` | `Test1234!` | Portfolio | Multi-community rollup                      |
| `empty@test.gavelhouse.app`     | `Test1234!` | n/a         | A brand-new community, for the zero-data UI |

The seed script talks to the API over HTTP, so it must run after `pnpm dev`
is already up, not before.

## 6. Open the app

http://localhost:3060

## Regenerating the screenshot archive

Optional, and only relevant if you have changed the UI. With the stack running
and seeded as above:

```bash
pnpm --filter @boardstack/app run e2e:capture
pnpm run screenshots:hero
pnpm run screenshots:optimize
pnpm run screenshots:index
```

The capture specs take several minutes and drive all three servers, so the
ordinary `pnpm --filter @boardstack/app run e2e` deliberately filters them out.
Output and conventions are described in
[docs/screenshots/README.md](screenshots/README.md).

## Optional integrations (Stripe, Resend, Google, Sentry, PostHog)

None of these are required to run the app locally:

- **Stripe**: billing screens render with blank price IDs; checkout stays
  inert until you set real test-mode keys.
- **Resend**: email sending is skipped when `RESEND_API_KEY` is blank.
- **Google OAuth**: the Google sign-in button is hidden when
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are blank; email/password sign-in
  still works.
- **Sentry**: error tracking is disabled when `SENTRY_DSN`/`VITE_SENTRY_DSN`
  are blank.
- **PostHog**: analytics are disabled when the PostHog key env vars are
  blank.

## Troubleshooting

### "Docker is required for local development"

`pnpm run dev:bootstrap` checks for `docker compose` (v2) and `docker-compose`
(v1) and fails fast with this message if neither is found, or if Docker
Desktop is installed but not running. Start Docker Desktop and re-run the
command.

### Port 55460 is already in use

The Postgres container publishes on `127.0.0.1:55460`. If that port is
already taken (for example, by another project's Postgres container), free
it or stop the conflicting container, then re-run `pnpm run dev:bootstrap`.
To check what's listening on the port:

```powershell
# PowerShell
Get-NetTCPConnection -LocalPort 55460
```

```bash
# POSIX
lsof -i :55460
```

### `DATABASE_URL` is not set when I run `db:migrate` manually

`pnpm run dev:bootstrap` sets `DATABASE_URL` for the migration command
automatically. If you run `pnpm --filter @boardstack/api run db:migrate`
yourself outside of `dev:bootstrap`, `drizzle.config.ts` reads
`DATABASE_URL` from `process.env`, so you must set it in your shell first:

**PowerShell:**

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev"; pnpm --filter @boardstack/api run db:migrate
```

**POSIX (bash/zsh):**

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev pnpm --filter @boardstack/api run db:migrate
```

### This cannot connect to production

By design. No production credentials, API tokens, or database URLs are
included anywhere in this repo, and the hosted Gavelhouse product is shut
down. Everything in this guide runs entirely on your machine against a local
Postgres container.

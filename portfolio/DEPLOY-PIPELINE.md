# Self-verifying deploys

Gavelhouse was built by one person with no reviewer and no staging
environment separate from production. The deploy pipeline exists to
compensate for that: instead of trusting that a `wrangler deploy` succeeded,
every deploy checks its own preconditions before running and checks the live
result after running.

The three canonical commands:
`pnpm --filter @boardstack/api run deploy`,
`pnpm --filter @boardstack/app run deploy`, and
`pnpm --filter @boardstack/web run deploy` all resolve to the same
orchestrator, [`scripts/run-deploy-sequence.mjs`](../scripts/run-deploy-sequence.mjs),
parameterized by project name. It runs four stages in order: preflight,
build, upload, verify.

## Preflight

[`scripts/lib/deploy-preflight.ts`](../scripts/lib/deploy-preflight.ts)
runs `runPreflight()` before anything is built or uploaded. Each check
exists to stop a specific failure mode:

- **Branch is `master`.** `git rev-parse --abbrev-ref HEAD` is compared
  against the required branch. This stops a deploy from shipping code from
  a feature branch that hasn't been merged and reviewed.
- **Working tree is clean.** `git status --porcelain` must be empty. This
  stops shipping uncommitted local changes that exist nowhere else: if the
  laptop dies, that code is gone even though it went to production.
- **HEAD is synced with origin.** `git fetch origin master` followed by a
  comparison of local and remote HEAD SHAs. This stops deploying a commit
  that was never pushed, which would leave production running code with no
  corresponding commit history anyone else (or a future session) could see.
- **No stale Cloudflare Pages project.** `assertNoStaleMarketingPagesProjects`
  shells out to `wrangler pages project list --json` and checks the result
  against two blocklists: old `ideas-validation`/`boardstack`-named
  marketing projects, and `boardstack-app`/`boardstack-web` should they ever
  be reintroduced as Pages projects. Gavelhouse's policy is exactly one
  production marketing site; this check enforces it as a deploy-time gate
  rather than trusting someone to remember to check the dashboard.
- **D1 migration file assertion.** `assertAiSdrNonceMigrationPlacement`
  checks that `apps/api/d1-migrations/0001_ai_sdr_nonces.sql` exists on
  disk before a deploy proceeds. This is a narrow, concrete check for one
  migration file whose absence would mean the AI-SDR nonce table was never
  created against the target D1 database. It isn't a general migration
  runner, just a guard against forgetting this one file.

All four checks accumulate into an `errors` array; preflight reports every
failure at once rather than stopping at the first one, and returns a
non-zero exit unless every check passes.

## BUILD_COMMIT injection and self-verification

Once preflight passes, `run-deploy-sequence.mjs` takes the verified commit
SHA and threads it through the rest of the pipeline as `BUILD_COMMIT` (plus
`PUBLIC_BUILD_COMMIT` / `VITE_BUILD_COMMIT` aliases for the two Vite-based
projects). Each project embeds it differently, and
[`scripts/lib/deploy-verify.ts`](../scripts/lib/deploy-verify.ts)
knows how to read each format back out:

- **api**: `BUILD_COMMIT` is written into a throwaway `.wrangler.deploy.toml`
  copy of `wrangler.toml` and also passed to `wrangler deploy` via
  `--define globalThis.__BUILD_COMMIT__:'<sha>'`, a build-time global.
  [`apps/api/src/routes/health.ts`](../apps/api/src/routes/health.ts)
  resolves it at request time and serves it as JSON:

  ```ts
  health.get("/health", (c) => c.json(payload(c.env)));
  health.get("/api/health", (c) => c.json(payload(c.env)));
  ```

  where `payload()` returns `{ ok: true, version: "1", commit: resolveBuildCommit(env) }`.

- **app**: [`apps/app/vite.config.ts`](../apps/app/vite.config.ts) reads
  `VITE_BUILD_COMMIT` from the environment at build time and registers a
  Vite plugin that does a literal string replace of `%VITE_BUILD_COMMIT%`
  in [`apps/app/index.html`](../apps/app/index.html), which contains
  `<meta name="build-commit" content="%VITE_BUILD_COMMIT%" />`.

- **web**: [`apps/web/src/layouts/base-layout.astro`](../apps/web/src/layouts/base-layout.astro)
  emits the same meta tag shape at render time from
  `import.meta.env.PUBLIC_BUILD_COMMIT`.

`verifyLiveCommit` then polls the live URL for each project (`/api/health`
for the API, `/` for app and web) with a cache-busting query param and
`cache-control: no-store`, until the served commit matches or a 60-second
deadline (3-second poll interval) elapses:

```ts
const url = urlForProject(options.project);
...
const served =
  options.project === "api"
    ? parseCommitFromJson(body)
    : parseCommitFromHtml(body);
lastServed = served;
if (commitMatches(options.expectedCommit, served)) {
  return { ok: true, servedCommit: served, attempts };
}
```

`parseCommitFromHtml` regex-matches the `build-commit` meta tag (in either
attribute order); `parseCommitFromJson` parses the health payload's `commit`
field. `commitMatches` allows either the expected or served SHA to be a
prefix of the other, since preflight emits a 7-character short SHA while
`git rev-parse HEAD` elsewhere returns the full 40 characters. If the
deadline passes without a match, the deploy script exits non-zero: the
upload may have succeeded, but the pipeline refuses to call the deploy done
until the edge is actually serving that commit, which matters on Cloudflare
where propagation isn't always instant.

## The enforcement mechanism: `check-no-raw-wrangler`

None of this preflight/build/verify sequence is useful if a developer can
just run `wrangler deploy` directly and skip it.
[`scripts/lib/check-no-raw-wrangler.ts`](../scripts/lib/check-no-raw-wrangler.ts)
closes that gap not at deploy time but at CI/`pnpm run verify` time, by
scanning every tracked `package.json` for `scripts` entries that match a
wrangler-deploy pattern:

```ts
// Only the explicit `deploy:upload` scripts inside the three app package.json
// files may call raw wrangler. Everything else must go through
// scripts/run-deploy-sequence.mjs so preflight + verify always run.
const ALLOWED_ENTRIES: readonly AllowedEntry[] = [
  {
    file: "apps/web/package.json",
    script: "deploy:upload",
    command: "wrangler deploy",
  },
  {
    file: "apps/app/package.json",
    script: "deploy:upload",
    command: "wrangler deploy",
  },
  {
    file: "apps/api/package.json",
    script: "deploy:upload",
    command: "wrangler deploy",
  },
];
```

Any other `package.json` script that matches `/\bwrangler\s+(?:pages\s+)?deploy\b/`
(with `--dry-run` invocations explicitly exempted) is flagged as a
violation and fails `pnpm run verify` (wired as `check:no-raw-wrangler` in
the root `package.json`, itself invoked from `scripts/check-no-raw-wrangler.ts`
via `git ls-files "*package.json"`). This is what actually makes the three
`deploy:upload` entries in the app package.json files the _only_ sanctioned
place raw wrangler appears in tracked scripts: each app's public `deploy`
script instead points at `run-deploy-sequence.mjs`, and that script is the
one that calls `wrangler deploy` internally after preflight passes.

## Where the guard stops

This entire system is a `package.json` script convention, not a hard
technical barrier. `CLAUDE.md` in this repo states it directly:

> Never invoke `wrangler` directly from the terminal — no hook or guard
> catches that; the `check-no-raw-wrangler` guard only blocks raw wrangler
> calls that get added to `package.json` scripts.

Someone with `wrangler` installed and Cloudflare credentials can type
`npx wrangler deploy` in `apps/api` right now and it will deploy, with no
preflight branch/sync/dirty-tree check, no `BUILD_COMMIT` injection, and no
post-deploy verification that the edge is actually serving what was just
pushed. The guard only catches the failure mode of _codifying_ a raw
wrangler call into a script someone else might run later. It does not, and
cannot from a static scan of tracked files, stop an interactive terminal
command. For a solo developer this is an honest tradeoff: the pipeline
raises the cost of a careless deploy without pretending to make one
impossible.

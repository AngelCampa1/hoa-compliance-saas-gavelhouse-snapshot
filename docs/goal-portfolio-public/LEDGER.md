# Goal: Portfolio-public — the snapshot reads well to a skeptical stranger

> Make this snapshot legible in ninety seconds to a senior engineer who has never
> heard of Gavelhouse, has seen a thousand portfolio repos, and is allergic to
> inflated claims. Promote the retrospective, evidence-backed write-ups to a root
> `portfolio/` directory a reviewer sees without scrolling. Leave the working
> residue — plans, runbooks, QA records, badge campaigns — in `docs/`, unedited.
>
> The honesty is the asset. Nothing here softens an admission. The product shut
> down without a paying customer, the balance sheet does not balance, the deploy
> pipeline has a documented bypass, and all three stay on the page.

## Method

1. Sort every document by the question it answers. Retrospective, reader-addressed,
   every claim traceable to a file in this tree → `portfolio/`. Prospective,
   self-addressed, dated, open-ended → stays in `docs/`.
2. Move with `git mv` so history follows. Then resolve every inbound link — README,
   sibling docs, generator scripts, `.gitattributes` — and re-verify by walking every
   relative link in every tracked Markdown file.
3. Read the embedded images as a viewer, not by filename. Judge each against the
   alternates in the archive before keeping it.
4. Log findings as P0 (broken/blocking) · P1 (looks bad or confusing) · P2 (polish).
   Retract anything claimed and then disproved.

## Cycle log

### Cycle 1 — 2026-08-13 — Document triage and the root `portfolio/`

Created `portfolio/` at the repository root and moved seven documents into it:
`ARCHITECTURE.md` and `METRICS.md` from `docs/`, the four deep dives from
`docs/engineering/`, and that directory's index, which became `portfolio/README.md`
and was widened to cover all six write-ups.

Left in `docs/`: `production-operator-guide.md`, `local-development.md`,
`infra-bootstrap.md`, `wiring-matrix.md`, `roadmap.md`, `content-map-2026.md`,
`WRITING_GUIDE.md`, `cloudflare-status-2026-04-21.md`, `fact-check/`,
`getting-badges/`, and `engineering/qa-history/`.

Basenames were kept exactly as they were. Renaming the four deep dives to match
`ARCHITECTURE.md`'s casing would have bought a tidier directory listing at the cost
of churning every anchor and link that already pointed at them, and would have
gained nothing a reviewer can see from the file list.

### Cycle 2 — 2026-08-13 — Link resolution

Repointed the root README's six document links, the four inline `→` callouts under
Notable engineering, the screenshot archive index, and the two generator scripts
that emit those strings. Rewrote the relative depth inside the moved deep dives —
they sat two levels down and now sit one, so every `../../apps/…` became `../apps/…`.
`portfolio/ARCHITECTURE.md`'s sibling links collapsed from `engineering/x.md` to
`./x.md`, and its two links back into `docs/` were re-rooted.

Walked all 984 tracked Markdown files and resolved every relative link. Zero broken
targets in `README.md`, `portfolio/`, or `docs/`. The 203 unresolved paths reported
are site-absolute Astro routes under `apps/web/src/content/` — routes, not files, and
outside this pass.

### Cycle 3 — 2026-08-13 — Images

Opened and judged all six embedded captures plus seven alternates from the archive.
Kept the existing six. See the registry for what was considered and rejected.

Rewrote all six alt texts. They had been short labels that repeated the caption;
they now describe what is actually visible in each frame, which is what a screen
reader and a broken-image placeholder need.

## Findings registry

### P0 — broken or blocking

- **F-01 (FIXED).** `scripts/collect-metrics.ts` resolved its output path with a
  hardcoded `docs/METRICS.md`. Moving the file without touching the script would have
  left `pnpm run metrics:generate` writing a second copy back into `docs/` and
  `metrics:check` failing the `verify` chain on a file that no longer existed there.
  Path constant and the three surrounding messages updated, plus the matching
  `text eol=lf` rule in `.gitattributes` and two comments in `scripts/lib/metrics.ts`.

- **F-02 (AVOIDED, no change made).** `docs/engineering/qa-history/` is named as a
  literal string in `apps/web/src/lib/gavelhouse-pricing-content-audit.test.ts`, which
  uses it to exempt the preserved QA record from the retired-pricing audit — auditing a
  historical document against today's price list would only force falsifying the record.
  Tidying `docs/engineering/` down to nothing by relocating `qa-history/` would have
  silently un-exempted it. It stays exactly where it is, and `docs/engineering/` now
  holds only that directory. Worth knowing before anyone tries to flatten it.

### P1 — looks bad or confusing

- **F-03 (FIXED).** All six embedded screenshots carried alt text that duplicated the
  column header above them (`![Trial balance]`, `![Dues]`). That is a filename-grade
  label, not a description. Each now names what the frame shows — the Fund column and
  the balanced totals, the four-of-six match state, the Fannie Mae threshold badge.

- **F-04 (FIXED).** The README pointed at `docs/METRICS.md` in flat prose while four
  other deep dives were introduced with a `→` callout. Rewritten to match, and it now
  says what the methodology document is actually for rather than naming it.

- **F-05 (WON'T FIX, deliberate).** `docs/screenshots/hero/finance-dues.png` shows a
  blank "Create a dues batch" form across its middle third. It is the weakest of the
  six. The two candidates that would replace it are worse: the general ledger capture
  at that viewport is an empty state reading "No transactions found", and the dashboard
  is an activation checklist reading "You're all set!". Kept, because the stat row above
  the form is real seeded data and the Fund Type selector is on screen.

- **F-06 (RETRACTED).** Initially read `finance-reserves.png` as self-contradictory: a
  "Percent Funded" stat of 44.3% sitting beside a badge reading "18.0% funded, compliant".
  Wrong — they measure different things. The badge is the Fannie Mae LL-2026-03 test on
  the *annual budget allocation*, and the page shows the inputs it is computed from
  ($90,000 of a $500,000 budget = 18.0%, against the ≥15% threshold the badge names).
  The image is correct and stays. Retracted before any change was made.

### P2 — polish

- **F-07 (FIXED).** Added a `## Documentation` table so the write-ups are reachable from
  one place rather than only from the paragraph that happens to mention each. Its last
  two rows deliberately break the pattern to surface the two working documents a reader
  is most likely to want next: the production runbook and how to run it locally.

- **F-08 (FIXED).** Added `portfolio/` to the stack table so it appears in the same list
  as the workspaces, rather than being discoverable only by scrolling GitHub's file view.

- **F-09 (VERIFIED, no change).** Re-checked the claim the whole README rests on:
  `apps/api/src/domain/accounting/postEntry.ts` is still the only non-test file that
  inserts into `journalEntries` or `journalLines`, it still sums debits and credits per
  `fundType` and throws `CommingleError` unless each side balances on its own, and its
  three callers all route through it. The path in the opening paragraph resolves.

- **F-10 (VERIFIED, no change).** No committed lint, typecheck, test, coverage, or build
  output anywhere in the tree. No local absolute paths in any tracked file. No
  `github.com/<private-org>/…` URL survives. Nothing to delete.

  **Correction (Cycle 4):** this was checked for the URL appearing as a public-facing
  claim, but missed a dead exemption pattern for that same URL sitting in the guard's
  own source and its tests. See F-11.

### Cycle 4 — 2026-08-13 — Guard exemption and two mislabeled screenshots

- **F-11 (FIXED).** `scripts/lib/public-facts-guard.ts` carried an exemption regex for
  the retired `github.com/<private-org>/boardstack` spelling, justified by a comment
  saying the old path "survives in dated records." A prior sanitization pass had
  already removed that literal string from the docs, so the exemption matched nothing
  and the private org name was sitting, unused, in tracked source. Removed the dead
  pattern and its stale comment; kept the exemption for the current public account
  spelling. The same private org name also appeared as a fixture value in three test
  files (`public-facts-guard.test.ts`, `snapshot.test.ts`, `metrics.test.ts`) — replaced
  with a placeholder (`PriorOrgName`) in every case, and rewrote the guard's own test to
  additionally assert that a placeholder or unrecognized account is *not* exempted, so
  the protective behavior (catching a private-org URL if one ever reappears) is now
  exercised rather than assumed. Full `pnpm run test:scripts` suite: 268/268 passing,
  coverage unchanged. `pnpm run check:public-facts` passes clean.

- **F-12 (FIXED).** Two screenshot filenames asserted things the pixels did not show,
  confirmed by hashing before any change:
  - `docs/screenshots/flows/05-owner-owner.png` and `05-owner-portal.png` were
    byte-identical, both showing the owner portal help screen. The `/owner` route is a
    pure redirect to `/portal` (`apps/app/src/routes/owner.index.tsx`), so there is no
    distinct `/owner` frame to show. Removed the duplicate `05-owner-owner.png`; kept
    `05-owner-portal.png` and updated its README row to note it represents both routes.
  - `docs/screenshots/app-states/journal-entry-form-guard.png` was byte-identical to
    `docs/screenshots/app/1440/finance-journal.png` — a fully functional journal form
    with nothing blocked, not the validation-guard state its name promised. Removed the
    duplicate and its row from the `app-states` table, which is scoped to dialogs,
    validation, and zero-data screens and this frame was none of those.
  No other tracked file referenced either removed filename.

### Cycle 5 — 2026-08-18 — Portfolio-standard alignment

Brought the repository in line with the cross-portfolio `PORTFOLIO-STANDARD.md` spec
(fifteen `*-snapshot` repos held to one rule set). Scope: `portfolio/` casing, the root
README's required headings and a structural table bug, a missing `TESTING.md`, curated
image relocation, and untagged fences.

- **Casing.** `portfolio/`'s four deep dives — `accounting-engine.md`, `audit-logging.md`,
  `concurrency-and-idempotency.md`, `deploy-pipeline.md` — renamed to
  `UPPERCASE-HYPHENATED.md` to match `ARCHITECTURE.md` and `METRICS.md`, closing the mixed
  casing this repo carried from Cycle 1's deliberate choice to keep basenames unchanged.
  Every inbound link updated: `README.md`, `portfolio/README.md`, `portfolio/ARCHITECTURE.md`,
  the file's own cross-links, `scripts/build-hero-set.ts`, `scripts/render-screenshot-index.ts`,
  and `docs/screenshots/README.md`. Confirmed zero remaining references to any of the four old
  lowercase filenames anywhere in the tracked tree.

- **`portfolio/TESTING.md` (new, required, was missing).** Sourced from
  `docs/engineering/qa-history/phase-1..4-review.md` and the recon/defect-inventory/production-
  bug-report documents, plus the five workspaces' `vitest.config.ts` coverage thresholds
  (verified: all five set `perFile: true` at 95%). Covers the automated suite, the real-vs-
  capture Playwright split, the phase-review findings with their actual fix counts (Phase 4:
  2 critical + 4 important, all fixed), the 135 defects catalogued across the three
  workspace-level defect inventories, and a `recon-05-review.md`-confirmed fix (a
  `VITEST_WORKER_ID` tier-enforcement bypass) — reverified against current
  `apps/api/src/domain/policy/access.ts`, not just against the review that reported it fixed.
  `portfolio/README.md`'s index table updated to include it.

- **Root README rewritten to the required heading set, exact text and order:** status moved
  into a `> [!IMPORTANT]` alert, byline/license into a `> [!NOTE]`, added a hero image with
  italic caption, `## Contents`, `## If you read one thing` (points at the balance-sheet
  equity gap — the one place the product's central invariant and its own reports disagree),
  `## What it did` (tense corrected for a shut-down product), `## Architecture`,
  `## By the numbers` (renamed from the generator-inserted `## About this snapshot`; verified
  safe — `metrics:check` only validates the `<!-- METRICS:START/END -->` block, and
  `scripts/lib/snapshot.test.ts` only asserts the heading text inside `renderSnapshotNotice`'s
  own output, never against this file), `## Repository map` (new), `## Documentation` (trimmed
  to spec: two sentences and two links, the file-by-file table removed from here since it now
  lives only in `portfolio/README.md`), `## Built with AI agents` (new — names the mandatory-
  reviewer-subagent gate and the Phase 4 review's real fix count, states plainly that this
  snapshot has no `.codex/` directory to disclose), `## Known gaps` (absorbed and reorganized
  the prior "A note on the code you'll find" section plus the balance-sheet gap, the KV race,
  the deploy-guard bypass, and the two items recon-05 left unresolved), `## Who built this`
  (byline extracted out of the License section, which now holds only the license text).

  **The structural bug at README.md:63-73** — three visually stacked one-row Markdown tables,
  each with its own header/separator, reading as one six-cell grid but parsing as three — is
  fixed. The `## Screenshots` section is now one real six-image HTML `<table>` grid (the
  pattern the spec calls for, since GitHub Markdown has no native grid), full alt text
  preserved on every image, none shortened.

- **Images.** Moved the six curated hero images — the ones actually referenced from the root
  README — from `docs/screenshots/hero/` into `portfolio/screenshots/`, matching the
  `portfolio/` = reader-facing evidence vs. `docs/` = working archive split this repository's
  Cycle 1 already established for documents. `scripts/build-hero-set.ts` retargeted to write
  there instead (and no longer appends to the archive manifest, since curated copies are not
  archive captures); `pnpm run screenshots:hero` re-run and verified it reproduces the same six
  files. `pnpm run screenshots:index` re-run: the archive's generated `docs/screenshots/README.md`
  now correctly omits the `## hero` section and reports 181 captures (187 PNGs − 6 relocated),
  with its one hardcoded cross-link updated to the new `ACCOUNTING-ENGINE.md` casing.

- **Fences.** One untagged fence found and tagged in `portfolio/CONCURRENCY-AND-IDEMPOTENCY.md`
  (a raw code-comment excerpt, tagged `ts`). A repository-wide sweep for open/close fence-count
  mismatches (a stronger check than counting bare `` ``` `` lines alone, since CRLF line endings
  in several files hid the mismatch from a naive grep) found seven more, all outside `portfolio/`:
  two marketing lead-magnet templates, one guide, `content/linkedin/_internal/_BRIEF.md`, two
  QA-history documents, and four env-var listings in `docs/infra-bootstrap.md`. Tagged the
  plain-text templates and path traces `text`, and the env-var blocks `dotenv` (matching a tag
  already used elsewhere in the same file). Re-swept the whole tree afterward: zero mismatches
  remain.

- **`docs/` pruning.** Searched for `.bak`, `.tmp`, `~`, `.orig`, OS-cruft files, empty
  directories, and zero-byte files under `docs/`. Found none — Cycles 1-4 already left it clean.
  No changes made; `docs/getting-badges/` and `docs/fact-check/` are working campaign material,
  not junk, and stay as Cycle 1 placed them.

- **Verification.** `pnpm run metrics:generate` re-run after the edits above (source line count
  drifted from file moves and script edits: 224,925 → 224,885); `metrics:check`,
  `check:public-facts`, and `knowledge:check` all pass clean. `pnpm run test:scripts`: 268/268
  passing, coverage unchanged from Cycle 4's baseline. `eslint` clean on both modified scripts.
  One pre-existing, unrelated typecheck failure noted and left alone:
  `scripts/postiz-upload.test.ts` references an `uploadsDisabled` option not in `UploadOptions`
  — present before this cycle, not touched by it, and outside this pass's scope (LinkedIn/Postiz
  tooling, not portfolio/docs/images).

### Cycle 6 — 2026-08-18 — `portfolio/ENGINEERING-LOG.md` (new, required, was missing)

Standard section 2.1 lists `ENGINEERING-LOG.md` as a required file; it did not exist. Written as
a dated log, not a sixth architecture write-up — ten entries, each citing the specific dated
document under `docs/engineering/qa-history/` it came from, drawn from the four phase reviews,
the April QA pass, the first production bug hunt, the two deep-audit defect inventories, and the
long-running defect-hunt tracker's session close-outs. Three source documents
(`recon-01-dashboard-app.md`, `recon-02-marketing-web.md`, `recon-03-api.md`) carry no date
header and are named only in a closing note explaining why they weren't cited directly, rather
than assigned a guessed date.

One claim from the existing `portfolio/TESTING.md` was checked against its cited source while
gathering material and did not hold up: it credits `recon-05-review.md` with confirming the fix
for the `VITEST_WORKER_ID` tier-bypass defect, but that file's actual "Verified-Fixed Defects"
list (read in full) never mentions it, and its date (2026-05-27) predates the defect's own
discovery in `defect-inventory-api.md` (2026-05-28) — a confirming document cannot chronologically
precede the finding it's credited with confirming. `ENGINEERING-LOG.md` cites the accurate chain
instead (found in `defect-inventory-api.md`, fixed the next day per `goal-e2e-defect-hunt.md`'s
Wave D, commit `b75e844`, reverified by reading current `apps/api/src/domain/policy/access.ts`).
`TESTING.md` itself was left unedited — fixing another file's claim is outside this task's scope
— but the discrepancy is recorded here rather than silently worked around.

`portfolio/README.md`'s index table gained a row for the new file. Root `README.md` gained a
fifth "Notable engineering" callout (the `journalLines`/tenant-isolation defect found five times
across two review cycles) pointing at it, alongside the existing generic index link in
`## Documentation`. Every relative link and `#anchor` added across the three touched files (25
link instances: 23 inside `ENGINEERING-LOG.md` itself, plus the two new cross-links into it) was
resolved programmatically against the filesystem and against the actual heading list of
`README.md`, not eyeballed. `pnpm run` verification suite not re-run this cycle — no script,
metrics, or generated content was touched, only new Markdown and one existing table.

### Cycle 7 — 2026-08-18 — `portfolio/SECURITY.md` (new, conditionally required, was missing)

Standard section 2.4 requires a security document (or a named equivalent) for any repo touching
PII, payments, or financial data; this one holds all three and had neither. Written as 387 lines
consolidating and verifying — not restating — the tenancy/role/tier gates `ARCHITECTURE.md`
already names, the auth and CSRF configuration in `apps/api/src/lib/auth.ts`, both Stripe webhook
surfaces and the shared `processedStripeEvents` idempotency table, `.env.example` and the
`wrangler secret put` pattern, and a `## What is not protected` section naming six specific gaps
plainly rather than implying nothing was missed.

Two claims were checked against their cited sources directly rather than trusted secondhand.
First, the tenant-isolation defect count: `ENGINEERING-LOG.md` and root `README.md` both say
"found five times," but `phase-4-review.md`'s own finding I-4 ("Same class as C-1/C-2") is a sixth
instance of the identical missing-`communityId`-predicate pattern that neither document's count
includes. `SECURITY.md` uses six, cites all six by finding ID and file:line, and names the
discrepancy in a `[!NOTE]` rather than silently adopting the lower number or silently overriding
it elsewhere. Second, a live scan of every tracked `.ts`/`.tsx`/`.toml`/`.env*` file for
`sk_live_`/`whsec_`/AWS-key/PEM/credentialed-Postgres-URL patterns found no real secret literal —
only local-dev defaults (`postgres://postgres:postgres@127.0.0.1:...`) and template values
(`sk_test_...` in `.dev.vars.example`) — confirmed before writing the Secrets handling section
rather than assumed from `.env.example` alone.

One finding surfaced during evidence-gathering that no existing portfolio document names: the
violation-evidence photo upload route (`GOVERNANCE_BUCKET.put`) has no corresponding retrieval
route anywhere in this tree — the dashboard's `EvidenceList` component renders only the stored
filename, never a link or image. `SECURITY.md` lists this under `## What is not protected` as
unverifiable rather than assumed safe or assumed broken.

`portfolio/README.md`'s index table gained a row for the new file, with its `wc -l` line count
(387) taken directly from the command rather than estimated. Root `README.md` gained one clause
in the existing `## Documentation` section pointing at `SECURITY.md` by name — no new table, no
new "Notable engineering" bullet, consistent with standard section 1.6's "stays short" rule for
that section. Every relative link, reference-style link definition, and `#anchor` across the
three touched files (87 inline links plus 5 reference-style link definitions in `SECURITY.md`
itself, plus 2 new cross-links in `README.md` and `portfolio/README.md`) was resolved
programmatically with a small Node script that reads each target file's actual heading list and
GitHub-slugs it, not eyeballed; the first pass caught four bad anchors (two `#L`-style
line-fragments that aren't a heading-anchor convention used anywhere else in this repo, one
double-hyphen typo in an `ENGINEERING-LOG.md` slug, and one that only failed because the checker
script itself mishandled this repo's CRLF line endings) and all four were fixed before this entry
was written. A second pass converted several of the longest inline citation links to
reference-style link definitions and shortened repeated full file paths to bare filenames once
the containing directory was already established in a preceding sentence, bringing the file's
p95 line length from 104 down to 99 columns — re-verified with both the link checker and a plain
`awk` line-length pass after every edit, not assumed from the first pass alone. `pnpm run`
verification suite not re-run this cycle — no script, metrics, or generated content was touched,
only new Markdown and two existing files' existing sections.

### Cycle 8 — 2026-08-18 — Six-column defect-inventory table (standard §3.3)

`portfolio/TESTING.md`'s defect-classification table (Workspace, Critical, High, Med, Low, Total)
had six columns against the standard's five-column maximum. Combined the four severity columns
into one `Critical / high / med / low` cell per row (e.g. `apps/api`: `5 / 13 / 22 / 4`), leaving
`Workspace` and `Total` as their own columns — three columns total, every one of the twelve
severity figures and the three row totals (44, 59, 32; 135 combined) preserved exactly, re-checked
against the pre-edit table row by row. `portfolio/TESTING.md`'s own line count was unchanged by
the edit (170 lines before and after), matching `portfolio/README.md`'s existing index row, so no
index update was needed. Every relative link and `#anchor` in `portfolio/TESTING.md` re-checked
programmatically against the file's own heading list and the three linked
`docs/engineering/qa-history/defect-inventory-*.md` targets; zero broken. No secret literal found.

### Cycle 9 — 2026-08-18 — Corpus-wide index column order, and prose lead-ins to real headings

- The cross-repo standard fixed `portfolio/README.md`'s index table column order as link,
  length, summary. This repo's table had `Document | Covers | Length`, length last —
  reordered to `Document | Length | Covers`; all nine rows and the alignment row updated.
- `portfolio/README.md` expressed two of the standard's three required index-page parts as
  bold prose lead-ins ("If you only read one:", "What isn't here:") instead of the real `##`
  headings all fourteen other repos in the corpus use. Read pebbledesk, gathergrove,
  grantpipe, and period-tracker-app-floriva's `portfolio/README.md` to confirm the majority
  wording, then converted both to `## If you read one thing` and `## What is not here`,
  capitalizing the sentence that now opens directly under the second heading.
- Recomputed every length cell against `wc -l` after all edits: all nine rows match exactly.
- Ran a relative-link and `#anchor` resolution sweep over `README.md` and every
  `portfolio/*.md` file: all resolve. No `## Contents` list exists in this file to reorder.

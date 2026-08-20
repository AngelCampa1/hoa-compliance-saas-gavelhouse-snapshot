/**
 * Copies the curated README images into portfolio/screenshots/.
 *
 *   pnpm run screenshots:hero
 *
 * The root README links into portfolio/screenshots/ rather than into the
 * working archive directly, so a re-capture cannot silently swap the images
 * it shows. Run this after the capture specs and before
 * `screenshots:optimize`.
 *
 * portfolio/screenshots/ is curated, published evidence — it is not part of
 * the docs/screenshots/ working archive, so this script does not touch that
 * archive's manifest. Re-running `screenshots:index` will not list these
 * files.
 *
 * Selection notes, since they are not obvious:
 *  - 1920 captures are viewport-clipped, so they crop to a clean 16:9 in a
 *    two-column README table. The 1440 set is full-page and reads as a smear
 *    at thumbnail size.
 *  - /bank/reconcile on its own is the "no statement selected" prompt. The
 *    interaction-state capture is the one that shows an actual reconciliation.
 *  - /dashboard is an activation checklist that reads "You're all set!" once
 *    the seed marks setup complete, so it is deliberately not a hero.
 *  - The balance sheet is deliberately not a hero either — see the equity gap
 *    in portfolio/ACCOUNTING-ENGINE.md.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const archiveRoot = path.join(repoRoot, "docs", "screenshots");
const heroRoot = path.join(repoRoot, "portfolio", "screenshots");

/** Archive-relative source → curated basename. */
const HERO_SET: ReadonlyArray<readonly [string, string]> = [
  ["app/1920/reports-trial-balance.png", "reports-trial-balance.png"],
  ["app-states/bank-reconcile-active.png", "bank-reconcile.png"],
  ["app/1920/finance-reserves.png", "finance-reserves.png"],
  ["app/1920/close.png", "close.png"],
  ["app/1920/governance-violations.png", "governance-violations.png"],
  ["app/1920/finance-dues.png", "finance-dues.png"],
];

const missing = HERO_SET.filter(
  ([source]) => !existsSync(path.join(archiveRoot, source)),
).map(([source]) => source);

if (missing.length > 0) {
  console.error(
    `Missing archive captures:\n  ${missing.join("\n  ")}\n` +
      "Run the capture specs first — see docs/local-development.md.",
  );
  process.exit(1);
}

// Rebuilt from scratch so a removed entry does not leave an orphan behind that
// the README would happily keep rendering.
rmSync(heroRoot, { recursive: true, force: true });
mkdirSync(heroRoot, { recursive: true });

for (const [source, target] of HERO_SET) {
  copyFileSync(path.join(archiveRoot, source), path.join(heroRoot, target));
}

console.log(
  `Wrote ${HERO_SET.length} curated images to portfolio/screenshots/.`,
);

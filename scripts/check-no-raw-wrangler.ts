import { execFileSync } from "node:child_process";
import {
  loadPackages,
  scanPackageJsonsForRawWrangler,
} from "./lib/check-no-raw-wrangler";

function listPackageJsonPaths(): string[] {
  const stdout = execFileSync(
    "git",
    ["ls-files", "*package.json", "**/package.json"],
    { encoding: "utf-8" },
  );
  const set = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.endsWith("package.json")) continue;
    if (trimmed.includes("node_modules/")) continue;
    set.add(trimmed);
  }
  return Array.from(set).sort();
}

function main(): void {
  const paths = listPackageJsonPaths();
  const packages = loadPackages(paths);
  const result = scanPackageJsonsForRawWrangler(packages);
  if (result.ok) {
    console.log(
      `check-no-raw-wrangler: scanned ${paths.length} package.json files, no raw wrangler deploy calls.`,
    );
    return;
  }
  console.error("check-no-raw-wrangler: found raw wrangler deploy calls:");
  for (const v of result.violations) {
    console.error(`  - ${v}`);
  }
  console.error(
    "\nAll production deploys must go through scripts/run-deploy-sequence.mjs.",
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

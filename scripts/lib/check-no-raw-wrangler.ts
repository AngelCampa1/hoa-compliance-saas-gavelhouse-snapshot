import { readFileSync } from "node:fs";

export type ScanResult = {
  ok: boolean;
  violations: string[];
};

type AllowedEntry = {
  file: string;
  script: string;
  command: string;
};

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

const WRANGLER_DEPLOY_PATTERN = /\bwrangler\s+(?:pages\s+)?deploy\b/;

export type LoadedPackage = {
  path: string; // normalised repo-relative path (forward slashes)
  json: unknown;
};

function normalisePath(filePath: string): string {
  return filePath.replaceAll("\\","/");
}

function allowedCommand(
  filePath: string,
  scriptKey: string,
): string | undefined {
  return ALLOWED_ENTRIES.some(
    (entry) => entry.file === filePath && entry.script === scriptKey,
  )
    ? ALLOWED_ENTRIES.find(
        (entry) => entry.file === filePath && entry.script === scriptKey,
      )?.command
    : undefined;
}

export function scanPackageJsonsForRawWrangler(
  packages: readonly LoadedPackage[],
): ScanResult {
  const violations: string[] = [];
  for (const pkg of packages) {
    const filePath = normalisePath(pkg.path);
    if (
      typeof pkg.json !== "object" ||
      pkg.json === null ||
      !("scripts" in pkg.json)
    ) {
      continue;
    }
    const scripts = (pkg.json as { scripts?: unknown }).scripts;
    if (typeof scripts !== "object" || scripts === null) continue;
    for (const [scriptKey, scriptValue] of Object.entries(
      scripts as Record<string, unknown>,
    )) {
      if (typeof scriptValue !== "string") continue;
      if (!WRANGLER_DEPLOY_PATTERN.test(scriptValue)) continue;
      // `--dry-run` never actually deploys; it's safe in build/test scripts.
      if (/--dry-run\b/.test(scriptValue)) continue;
      const expectedAllowedCommand = allowedCommand(filePath, scriptKey);
      if (expectedAllowedCommand) {
        if (scriptValue === expectedAllowedCommand) continue;
        violations.push(
          `${filePath} scripts["${scriptKey}"] has unsafe wrangler target: ${scriptValue}`,
        );
        continue;
      }
      violations.push(
        `${filePath} scripts["${scriptKey}"] calls wrangler directly: ${scriptValue}`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}

export function loadPackages(paths: readonly string[]): LoadedPackage[] {
  return paths.map((p) => ({
    path: p,
    json: JSON.parse(readFileSync(p, "utf8")) as unknown,
  }));
}

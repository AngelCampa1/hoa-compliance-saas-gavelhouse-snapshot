import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PreflightProject = "api" | "app" | "web";

export type PreflightOptions = {
  project: PreflightProject;
  requiredBranch?: "master";
  allowDirty?: boolean;
  env?: NodeJS.ProcessEnv;
  exec?: ExecFn;
  repoRoot?: string;
};

export type PreflightResult = {
  ok: boolean;
  commitSha: string;
  fullSha: string;
  errors: string[];
};

export type ExecFn = (command: string, args: readonly string[]) => string;

const defaultExec: ExecFn = (command, args) => {
  if (process.platform === "win32") {
    // On Windows, `npx` and other `.cmd` shims require shell resolution.
    return execFileSync(
      process.env["ComSpec"] ?? "cmd.exe",
      ["/d", "/s", "/c", [command, ...args].join(" ")],
      { encoding: "utf-8" },
    );
  }
  return execFileSync(command, args as string[], { encoding: "utf-8" });
};

type CloudflarePagesProjectEntry = {
  "Project Name"?: unknown;
};

const STALE_MARKETING_PROJECT_NAMES = [
  "ideas-validation",
  "boardstack",
] as const;
const STALE_FRONTEND_PROJECT_NAMES = [
  "boardstack-app",
  "boardstack-web",
] as const;

export async function runPreflight(
  options: PreflightOptions,
): Promise<PreflightResult> {
  const env = options.env ?? process.env;
  const exec = options.exec ?? defaultExec;
  const requiredBranch = options.requiredBranch ?? "master";
  const errors: string[] = [];

  let fullSha = "";
  let commitSha = "";

  try {
    fullSha = exec("git", ["rev-parse", "HEAD"]).trim();
    commitSha = fullSha.slice(0, 7);
  } catch (error) {
    errors.push(`Unable to read HEAD commit: ${formatError(error)}`);
  }

  const allowNonMaster =
    Boolean(options.allowDirty) && env["DEPLOY_ALLOW_NON_MASTER"] === "1";

  let branch = "";
  try {
    branch = exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  } catch (error) {
    errors.push(`Unable to read current branch: ${formatError(error)}`);
  }

  if (branch && branch !== requiredBranch && !allowNonMaster) {
    errors.push(
      `Current branch is "${branch}" but deploys must run from "${requiredBranch}". ` +
        `Set DEPLOY_ALLOW_NON_MASTER=1 and pass --allow-dirty to override for an emergency hotfix.`,
    );
  }

  if (!options.allowDirty) {
    try {
      const status = exec("git", ["status", "--porcelain"]);
      if (status.trim().length > 0) {
        errors.push(
          "Working tree is dirty. Commit or stash changes before deploying.",
        );
      }
    } catch (error) {
      errors.push(`Unable to read working tree status: ${formatError(error)}`);
    }
  }

  try {
    exec("git", ["fetch", "origin", requiredBranch]);
    const localHead = exec("git", ["rev-parse", "HEAD"]).trim();
    const remoteHead = exec("git", [
      "rev-parse",
      `origin/${requiredBranch}`,
    ]).trim();
    if (localHead && remoteHead && localHead !== remoteHead) {
      errors.push(
        `HEAD (${localHead.slice(0, 7)}) is not in sync with origin/${requiredBranch} (${remoteHead.slice(0, 7)}). ` +
          "Pull or push before deploying.",
      );
    }
  } catch (error) {
    errors.push(
      `Unable to verify sync with origin/${requiredBranch}: ${formatError(error)}`,
    );
  }

  const cloudflareError = assertNoStaleMarketingPagesProjects(exec);
  if (cloudflareError) {
    errors.push(cloudflareError);
  }

  const aiSdrNonceMigrationError = assertAiSdrNonceMigrationPlacement(
    options.repoRoot ?? process.cwd(),
  );
  if (aiSdrNonceMigrationError) {
    errors.push(aiSdrNonceMigrationError);
  }

  return {
    ok: errors.length === 0,
    commitSha,
    fullSha,
    errors,
  };
}

function assertAiSdrNonceMigrationPlacement(repoRoot: string): string | null {
  const d1MigrationPath = join(
    repoRoot,
    "apps",
    "api",
    "d1-migrations",
    "0001_ai_sdr_nonces.sql",
  );
  if (!existsSync(d1MigrationPath)) {
    return "Missing apps/api/d1-migrations/0001_ai_sdr_nonces.sql for AI-SDR nonce storage.";
  }

  return null;
}

function assertNoStaleMarketingPagesProjects(exec: ExecFn): string | null {
  let projectListRaw: string;
  try {
    projectListRaw = exec("npx", [
      "wrangler",
      "pages",
      "project",
      "list",
      "--json",
    ]);
  } catch (error) {
    return `Unable to query Cloudflare Pages projects via wrangler: ${formatError(error)}`;
  }

  let projectList: unknown;
  try {
    projectList = JSON.parse(projectListRaw);
  } catch (error) {
    return `wrangler pages project list did not return valid JSON: ${formatError(error)}`;
  }

  if (!Array.isArray(projectList)) {
    return "wrangler pages project list returned an unexpected shape (expected array).";
  }

  const staleProject = (projectList as CloudflarePagesProjectEntry[]).find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      STALE_MARKETING_PROJECT_NAMES.includes(
        entry["Project Name"] as (typeof STALE_MARKETING_PROJECT_NAMES)[number],
      ),
  );

  if (staleProject) {
    return `Stale marketing Pages project "${staleProject["Project Name"]}" still exists. Remove or disable it before deploying Gavelhouse production resources.`;
  }

  const staleFrontendProject = (
    projectList as CloudflarePagesProjectEntry[]
  ).find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      STALE_FRONTEND_PROJECT_NAMES.includes(
        entry["Project Name"] as (typeof STALE_FRONTEND_PROJECT_NAMES)[number],
      ),
  );

  if (staleFrontendProject) {
    return `Stale frontend Pages project "${staleFrontendProject["Project Name"]}" still exists. Remove or disable it before deploying Gavelhouse production resources.`;
  }

  return null;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

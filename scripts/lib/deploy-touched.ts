import { execFileSync } from "node:child_process";

export type DeployProject = "api" | "app" | "web";

export type DeployPlan = {
  projects: DeployProject[];
  reasons: Record<DeployProject, string[]>;
};

const PROJECT_ORDER: DeployProject[] = ["api", "app", "web"];

const DEPLOY_COMMANDS: Record<DeployProject, readonly [string, string[]]> = {
  api: ["pnpm", ["run", "deploy:api"]],
  app: ["pnpm", ["run", "deploy:app"]],
  web: ["pnpm", ["run", "deploy:web"]],
};

const SHARED_DEPENDENCY_PATHS = [
  "packages/shared/",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
];

const DESIGN_DEPENDENCY_PATHS = ["packages/design/"];

export function normalizeGitPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function touchesAny(filePath: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      filePath === prefix.replace(/\/$/, "") || filePath.startsWith(prefix),
  );
}

export function createDeployPlan(filePaths: readonly string[]): DeployPlan {
  const reasons: Record<DeployProject, string[]> = {
    api: [],
    app: [],
    web: [],
  };

  for (const rawFilePath of filePaths) {
    const filePath = normalizeGitPath(rawFilePath);

    if (touchesAny(filePath, SHARED_DEPENDENCY_PATHS)) {
      for (const project of PROJECT_ORDER) {
        reasons[project].push(filePath);
      }
      continue;
    }

    if (touchesAny(filePath, DESIGN_DEPENDENCY_PATHS)) {
      reasons.app.push(filePath);
      reasons.web.push(filePath);
      continue;
    }

    if (filePath.startsWith("apps/api/")) {
      reasons.api.push(filePath);
      continue;
    }

    if (filePath.startsWith("apps/app/")) {
      reasons.app.push(filePath);
      continue;
    }

    if (filePath.startsWith("apps/web/")) {
      reasons.web.push(filePath);
    }
  }

  return {
    projects: PROJECT_ORDER.filter((project) => reasons[project].length > 0),
    reasons,
  };
}

export function parseDeployTouchedArgs(args: readonly string[]): {
  all: boolean;
  dryRun: boolean;
  fromRef: string;
} {
  let all = false;
  let dryRun = false;
  let fromRef = process.env["DEPLOY_FROM"] ?? "origin/master";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--from") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for --from.");
      }
      fromRef = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { all, dryRun, fromRef };
}

export function parseGitDiffOutput(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function getTouchedFiles(fromRef: string): string[] {
  const committedDiff = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${fromRef}...HEAD`],
    { encoding: "utf-8" },
  );
  const workingTreeDiff = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD"],
    { encoding: "utf-8" },
  );
  const untrackedFiles = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { encoding: "utf-8" },
  );

  return mergeTouchedFileLists(committedDiff, workingTreeDiff, untrackedFiles);
}

export function mergeTouchedFileLists(...outputs: readonly string[]): string[] {
  return Array.from(
    new Set(outputs.flatMap((output) => parseGitDiffOutput(output))),
  );
}

export function runDeployCommand(project: DeployProject): void {
  const [command, args] = DEPLOY_COMMANDS[project];

  if (process.platform === "win32") {
    execFileSync(
      process.env["ComSpec"] ?? "cmd.exe",
      ["/d", "/s", "/c", [command, ...args].join(" ")],
      { stdio: "inherit" },
    );
    return;
  }

  execFileSync(command, args, { stdio: "inherit" });
}

export function getAllProjects(): DeployProject[] {
  return [...PROJECT_ORDER];
}

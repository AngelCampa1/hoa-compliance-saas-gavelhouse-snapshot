import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT_GATE_FILES = new Set([
  "eslint.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/vitest.config.ts",
  "tsconfig.base.json",
  "turbo.json",
]);

export interface PackageInfo {
  name: string;
  scripts: Record<string, string>;
}

export interface AffectedPackage {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

export interface FilterArgs {
  lintFilters: string[];
  typecheckFilters: string[];
  coverageFilters: string[];
  runScriptsTests: boolean;
}

export interface ExecCommand {
  command: string;
  args: string[];
}

export type PackageMap = Record<string, PackageInfo>;

export interface FsDeps {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
}

export interface Deps {
  getStagedFiles: () => string[];
  discoverPackages: (rootDir: string) => PackageMap;
  exec: (command: ExecCommand) => void;
  log: (message: string) => void;
  exit: (code: number) => void;
  cwd: () => string;
}

type EnvLookup = Record<string, string | undefined>;

function resolvePnpmCliPath(env: EnvLookup): string | null {
  const candidates = [
    env["npm_execpath"],
    env["APPDATA"]
      ? join(env["APPDATA"], "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")
      : undefined,
    env["PNPM_HOME"]
      ? join(env["PNPM_HOME"], "node_modules", "pnpm", "bin", "pnpm.cjs")
      : undefined,
  ];

  const pnpmCli = candidates.find(
    (candidate) =>
      candidate !== undefined &&
      /pnpm\.cjs$/i.test(candidate) &&
      existsSync(candidate),
  );
  return pnpmCli ?? null;
}

export function createPnpmCommand(
  args: string[],
  options: { env?: EnvLookup; platform?: NodeJS.Platform } = {},
): ExecCommand {
  const pnpmCli = resolvePnpmCliPath(options.env ?? process.env);
  if (pnpmCli) {
    return {
      command: process.execPath,
      args: [pnpmCli, ...args],
    };
  }
  if ((options.platform ?? process.platform) !== "win32") {
    return { command: "pnpm", args };
  }
  throw new Error("Unable to locate pnpm CLI for affected package checks.");
}

export function mapFileToPackage(
  filePath: string,
  packages: PackageMap,
): AffectedPackage | null {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith("scripts/")) {
    return { name: "__scripts__", dir: "scripts", scripts: {} };
  }

  for (const [dir, pkg] of Object.entries(packages)) {
    if (normalized.startsWith(dir + "/")) {
      return { name: pkg.name, dir, scripts: pkg.scripts };
    }
  }

  return null;
}

export function getAffectedPackages(
  files: string[],
  packages: PackageMap,
): AffectedPackage[] {
  const normalizedFiles = files.map((file) => file.replace(/\\/g, "/"));
  const hasRootGateChange = normalizedFiles.some((file) =>
    ROOT_GATE_FILES.has(file),
  );

  if (hasRootGateChange) {
    const affectedPackages = Object.entries(packages).map(([dir, pkg]) => ({
      name: pkg.name,
      dir,
      scripts: pkg.scripts,
    }));
    const needsScriptsChecks = normalizedFiles.some(
      (file) =>
        file === "scripts/vitest.config.ts" || file.startsWith("scripts/"),
    );
    if (needsScriptsChecks) {
      affectedPackages.push({
        name: "__scripts__",
        dir: "scripts",
        scripts: {},
      });
    }
    return affectedPackages;
  }

  const seen = new Set<string>();
  const result: AffectedPackage[] = [];
  const addPackage = (pkg: AffectedPackage) => {
    if (!seen.has(pkg.name)) {
      seen.add(pkg.name);
      result.push(pkg);
    }
  };
  const addPackageByDir = (dir: string) => {
    const pkg = packages[dir];
    if (pkg) addPackage({ name: pkg.name, dir, scripts: pkg.scripts });
  };

  for (const file of files) {
    const pkg = mapFileToPackage(file, packages);
    if (pkg) {
      addPackage(pkg);
      if (pkg.dir === "packages/shared") {
        addPackageByDir("apps/api");
        addPackageByDir("apps/app");
        addPackageByDir("apps/web");
      }
      if (pkg.dir === "packages/design") {
        addPackageByDir("apps/app");
        addPackageByDir("apps/web");
      }
    }
  }

  return result;
}

export function buildFilterArgs(packages: AffectedPackage[]): FilterArgs {
  const lintFilters: string[] = [];
  const typecheckFilters: string[] = [];
  const coverageFilters: string[] = [];
  let runScriptsTests = false;

  for (const pkg of packages) {
    if (pkg.name === "__scripts__") {
      runScriptsTests = true;
      continue;
    }
    if (pkg.scripts.lint) {
      lintFilters.push(`--filter=${pkg.name}`);
    }
    if (pkg.scripts.typecheck) {
      typecheckFilters.push(`--filter=${pkg.name}`);
    }
    if (pkg.scripts["test:coverage"]) {
      coverageFilters.push(`--filter=${pkg.name}`);
    }
  }

  return {
    lintFilters,
    typecheckFilters,
    coverageFilters,
    runScriptsTests,
  };
}

export function discoverPackages(rootDir: string, fs: FsDeps): PackageMap {
  const packages: PackageMap = {};
  const workspaceDirs = ["packages", "apps"];

  for (const wsDir of workspaceDirs) {
    const fullPath = join(rootDir, wsDir);
    let entries: string[];
    try {
      entries = fs.readdirSync(fullPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgJsonPath = join(fullPath, entry, "package.json");
      try {
        const raw = fs.readFileSync(pkgJsonPath, "utf-8");
        const parsed = JSON.parse(raw) as {
          name?: string;
          scripts?: Record<string, string>;
        };
        const relDir = `${wsDir}/${entry}`;
        packages[relDir] = {
          name: parsed.name ?? entry,
          scripts: parsed.scripts ?? {},
        };
      } catch {
        continue;
      }
    }
  }

  return packages;
}

export function main(deps: Deps): void {
  const rootDir = deps.cwd();
  const stagedFiles = deps.getStagedFiles();

  if (stagedFiles.length === 0) {
    deps.log("No staged files. Skipping package-level checks.");
    deps.exit(0);
    return;
  }

  const packages = deps.discoverPackages(rootDir);
  const affected = getAffectedPackages(stagedFiles, packages);

  if (affected.length === 0) {
    deps.log("No workspace packages affected. Skipping checks.");
    deps.exit(0);
    return;
  }

  const { lintFilters, typecheckFilters, coverageFilters, runScriptsTests } =
    buildFilterArgs(affected);

  const affectedNames = affected
    .filter((p) => p.name !== "__scripts__")
    .map((p) => p.name);
  if (affectedNames.length > 0) {
    deps.log(`Affected packages: ${affectedNames.join(",")}`);
  }

  if (lintFilters.length > 0) {
    deps.exec(createPnpmCommand(["exec", "turbo", "lint", ...lintFilters]));
  }

  if (typecheckFilters.length > 0) {
    deps.exec(
      createPnpmCommand(["exec", "turbo", "typecheck", ...typecheckFilters]),
    );
  }

  if (coverageFilters.length > 0) {
    deps.exec(
      createPnpmCommand([
        "exec",
        "turbo",
        "test:coverage",
        "--concurrency=1",
        ...coverageFilters,
      ]),
    );
  }

  if (runScriptsTests) {
    deps.exec(
      createPnpmCommand([
        "exec",
        "vitest",
        "run",
        "--coverage",
        "--config",
        "scripts/vitest.config.ts",
      ]),
    );
  }

  deps.log("\nAll checks passed.");
}

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  mapFileToPackage,
  getAffectedPackages,
  buildFilterArgs,
  discoverPackages,
  main,
  createPnpmCommand,
  type PackageMap,
  type AffectedPackage,
} from "./affected-packages.js";

type ExecCall = { command: string; args: string[] };

function matchesPnpmCommand(call: ExecCall, expectedArgs: string[]): boolean {
  if (call.command === "pnpm") {
    return JSON.stringify(call.args) === JSON.stringify(expectedArgs);
  }

  return (
    call.command === process.execPath &&
    /pnpm\.cjs$/i.test(call.args[0] ?? "") &&
    JSON.stringify(call.args.slice(1)) === JSON.stringify(expectedArgs)
  );
}

function expectPnpmCall(calls: ExecCall[], expectedArgs: string[]): void {
  expect(calls.some((call) => matchesPnpmCommand(call, expectedArgs))).toBe(
    true,
  );
}

const PACKAGES: PackageMap = {
  "apps/app": {
    name: "@boardstack/app",
    scripts: { lint: "eslint .", typecheck: "tsc", "test:coverage": "vitest" },
  },
  "apps/api": {
    name: "@boardstack/api",
    scripts: { lint: "eslint .", typecheck: "tsc", "test:coverage": "vitest" },
  },
  "packages/shared": {
    name: "@boardstack/shared",
    scripts: { lint: "eslint .", typecheck: "tsc", "test:coverage": "vitest" },
  },
  "packages/design": {
    name: "@boardstack/design",
    scripts: {},
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mapFileToPackage", () => {
  it("maps a file in apps/app to the app package", () => {
    const result = mapFileToPackage("apps/app/src/main.tsx", PACKAGES);
    expect(result?.name).toBe("@boardstack/app");
  });

  it("maps a scripts/ file to __scripts__", () => {
    const result = mapFileToPackage("scripts/run-affected-checks.ts", PACKAGES);
    expect(result?.name).toBe("__scripts__");
  });

  it("returns null for unrecognised files", () => {
    const result = mapFileToPackage("docs/readme.md", PACKAGES);
    expect(result).toBeNull();
  });

  it("maps a file in packages/shared to the shared package", () => {
    const result = mapFileToPackage("packages/shared/src/index.ts", PACKAGES);
    expect(result?.name).toBe("@boardstack/shared");
  });

  it("normalises backslash paths", () => {
    const result = mapFileToPackage("apps\\api\\src\\index.ts", PACKAGES);
    expect(result?.name).toBe("@boardstack/api");
  });
});

describe("getAffectedPackages", () => {
  it("returns all packages when a root gate file changes", () => {
    const affected = getAffectedPackages(["turbo.json"], PACKAGES);
    const names = affected.map((p) => p.name);
    expect(names).toContain("@boardstack/app");
    expect(names).toContain("@boardstack/api");
    expect(names).toContain("@boardstack/shared");
  });

  it("returns only the affected package for a scoped change", () => {
    const affected = getAffectedPackages(["apps/api/src/index.ts"], PACKAGES);
    expect(affected).toHaveLength(1);
    expect(affected[0].name).toBe("@boardstack/api");
  });

  it("expands shared changes to all dependent apps", () => {
    const affected = getAffectedPackages(
      ["packages/shared/src/index.ts"],
      PACKAGES,
    );
    expect(affected.map((p) => p.name)).toEqual([
      "@boardstack/shared",
      "@boardstack/api",
      "@boardstack/app",
    ]);
  });

  it("expands design changes to app dependents", () => {
    const packages: PackageMap = {
      ...PACKAGES,
      "apps/web": {
        name: "@boardstack/web",
        scripts: { lint: "eslint .", typecheck: "astro check" },
      },
    };
    const affected = getAffectedPackages(
      ["packages/design/src/tokens.css"],
      packages,
    );
    expect(affected.map((p) => p.name)).toEqual([
      "@boardstack/design",
      "@boardstack/app",
      "@boardstack/web",
    ]);
  });

  it("deduplicates packages when multiple files from same package are staged", () => {
    const affected = getAffectedPackages(
      ["apps/app/src/app.tsx", "apps/app/src/main.tsx"],
      PACKAGES,
    );
    expect(affected).toHaveLength(1);
  });

  it("includes __scripts__ when scripts/ file changes alongside root gate file", () => {
    const affected = getAffectedPackages(
      ["turbo.json", "scripts/run-affected-checks.ts"],
      PACKAGES,
    );
    const names = affected.map((p) => p.name);
    expect(names).toContain("__scripts__");
  });

  it("returns __scripts__ for a scripts/ change without root gate", () => {
    const affected = getAffectedPackages(
      ["scripts/lib/affected-packages.ts"],
      PACKAGES,
    );
    expect(affected).toHaveLength(1);
    expect(affected[0].name).toBe("__scripts__");
  });

  it("returns empty array when no files match any package", () => {
    const affected = getAffectedPackages(["docs/roadmap.md"], PACKAGES);
    expect(affected).toHaveLength(0);
  });
});

describe("buildFilterArgs", () => {
  it("builds filter args for regular packages", () => {
    const packages: AffectedPackage[] = [
      {
        name: "@boardstack/app",
        dir: "apps/app",
        scripts: {
          lint: "eslint .",
          typecheck: "tsc",
          "test:coverage": "vitest",
        },
      },
    ];
    const args = buildFilterArgs(packages);
    expect(args.lintFilters).toContain("--filter=@boardstack/app");
    expect(args.typecheckFilters).toContain("--filter=@boardstack/app");
    expect(args.coverageFilters).toContain("--filter=@boardstack/app");
    expect(args.runScriptsTests).toBe(false);
  });

  it("sets runScriptsTests when __scripts__ is in the list", () => {
    const packages: AffectedPackage[] = [
      { name: "__scripts__", dir: "scripts", scripts: {} },
    ];
    const args = buildFilterArgs(packages);
    expect(args.runScriptsTests).toBe(true);
    expect(args.lintFilters).toHaveLength(0);
  });

  it("skips lint/typecheck/coverage for packages without those scripts", () => {
    const packages: AffectedPackage[] = [
      { name: "@boardstack/web", dir: "apps/web", scripts: {} },
    ];
    const args = buildFilterArgs(packages);
    expect(args.lintFilters).toHaveLength(0);
    expect(args.typecheckFilters).toHaveLength(0);
    expect(args.coverageFilters).toHaveLength(0);
  });
});

describe("discoverPackages", () => {
  it("discovers packages from apps/ and packages/ directories", () => {
    const fsMock = {
      readdirSync: (path: string) => {
        if (path.endsWith("apps")) return ["app", "api"];
        if (path.endsWith("packages")) return ["shared"];
        return [];
      },
      readFileSync: (path: string) => {
        if (path.includes("apps/app") || path.includes("apps\\app"))
          return JSON.stringify({
            name: "@boardstack/app",
            scripts: { lint: "eslint ." },
          });
        if (path.includes("apps/api") || path.includes("apps\\api"))
          return JSON.stringify({ name: "@boardstack/api", scripts: {} });
        if (path.includes("shared"))
          return JSON.stringify({ name: "@boardstack/shared", scripts: {} });
        throw new Error("not found");
      },
    };
    const result = discoverPackages("/root", fsMock);
    expect(result["apps/app"].name).toBe("@boardstack/app");
    expect(result["apps/api"].name).toBe("@boardstack/api");
    expect(result["packages/shared"].name).toBe("@boardstack/shared");
  });

  it("uses directory name and empty scripts when package metadata is minimal", () => {
    const fsMock = {
      readdirSync: (path: string) => {
        if (path.endsWith("apps")) return ["api"];
        if (path.endsWith("packages")) return [];
        return [];
      },
      readFileSync: () => JSON.stringify({}),
    };

    const result = discoverPackages("/root", fsMock);

    expect(result["apps/api"]).toEqual({ name: "api", scripts: {} });
  });

  it("skips directories where package.json cannot be read", () => {
    const fsMock = {
      readdirSync: () => ["valid", "broken"],
      readFileSync: (path: string) => {
        if (path.includes("valid"))
          return JSON.stringify({ name: "@test/valid", scripts: {} });
        throw new Error("not found");
      },
    };
    const result = discoverPackages("/root", fsMock);
    expect(Object.keys(result)).toHaveLength(2); // apps/valid + packages/valid
  });

  it("continues when a workspace dir does not exist", () => {
    const fsMock = {
      readdirSync: (_path: string): string[] => {
        throw new Error("ENOENT");
      },
      readFileSync: () => "{}",
    };
    const result = discoverPackages("/root", fsMock);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("main", () => {
  it("exits 0 and logs when there are no staged files", () => {
    const deps = {
      getStagedFiles: () => [],
      discoverPackages: () => PACKAGES,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };
    main(deps);
    expect(deps.exit).toHaveBeenCalledWith(0);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it("exits 0 and logs when no packages are affected", () => {
    const deps = {
      getStagedFiles: () => ["docs/readme.md"],
      discoverPackages: () => PACKAGES,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };
    main(deps);
    expect(deps.exit).toHaveBeenCalledWith(0);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it("runs turbo lint, typecheck, and coverage for an affected package", () => {
    const deps = {
      getStagedFiles: () => ["apps/app/src/app.tsx"],
      discoverPackages: () => PACKAGES,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };
    main(deps);
    const calls = (deps.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as { command: string; args: string[] },
    );
    expect(calls.some((c) => c.args.includes("lint"))).toBe(true);
    expect(calls.some((c) => c.args.includes("typecheck"))).toBe(true);
    expect(calls.some((c) => c.args.includes("test:coverage"))).toBe(true);
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it("separates turbo filter arguments for multiple affected packages", () => {
    const deps = {
      getStagedFiles: () => ["apps/app/src/app.tsx", "apps/api/src/index.ts"],
      discoverPackages: () => PACKAGES,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };
    main(deps);
    const calls = (deps.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as ExecCall,
    );
    expectPnpmCall(calls, [
      "exec",
      "turbo",
      "lint",
      "--filter=@boardstack/app",
      "--filter=@boardstack/api",
    ]);
    expectPnpmCall(calls, [
      "exec",
      "turbo",
      "typecheck",
      "--filter=@boardstack/app",
      "--filter=@boardstack/api",
    ]);
    expectPnpmCall(calls, [
      "exec",
      "turbo",
      "test:coverage",
      "--concurrency=1",
      "--filter=@boardstack/app",
      "--filter=@boardstack/api",
    ]);
  });

  it("runs scripts vitest suite when __scripts__ is affected", () => {
    const deps = {
      getStagedFiles: () => ["scripts/lib/affected-packages.ts"],
      discoverPackages: () => PACKAGES,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };
    main(deps);
    const calls = (deps.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as ExecCall,
    );
    expectPnpmCall(calls, [
      "exec",
      "vitest",
      "run",
      "--coverage",
      "--config",
      "scripts/vitest.config.ts",
    ]);
  });

  it("passes package filters as exec arguments instead of shell text", () => {
    const packages: PackageMap = {
      "apps/app": {
        name: "@boardstack/app & echo pwned",
        scripts: {
          lint: "eslint .",
          typecheck: "tsc",
          "test:coverage": "vitest",
        },
      },
    };
    const deps = {
      getStagedFiles: () => ["apps/app/src/app.tsx"],
      discoverPackages: () => packages,
      exec: vi.fn(),
      log: vi.fn(),
      exit: vi.fn(),
      cwd: () => "/root",
    };

    main(deps);

    const calls = (deps.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as ExecCall,
    );
    expectPnpmCall(calls, [
      "exec",
      "turbo",
      "lint",
      "--filter=@boardstack/app & echo pwned",
    ]);
  });

  it("builds a shell-free pnpm command", () => {
    const command = createPnpmCommand(["--version"]);

    expect(matchesPnpmCommand(command, ["--version"])).toBe(true);
  });

  it("throws when the pnpm CLI cannot be located", () => {
    vi.stubEnv("npm_execpath", "C:/missing/pnpm.cjs");
    vi.stubEnv("APPDATA", "C:/missing-appdata");
    vi.stubEnv("PNPM_HOME", "C:/missing-pnpm-home");

    expect(() =>
      createPnpmCommand(["--version"], { platform: "win32" }),
    ).toThrowError(/Unable to locate pnpm CLI/);
  });

  it("falls back to PATH pnpm on non-Windows when the pnpm CLI is not located", () => {
    const command = createPnpmCommand(["--version"], {
      platform: "linux",
      env: {
        npm_execpath: "/missing/pnpm.cjs",
        APPDATA: undefined,
        PNPM_HOME: "/missing-pnpm-home",
      },
    });

    expect(command).toEqual({ command: "pnpm", args: ["--version"] });
  });

  it("throws on Windows when APPDATA and PNPM_HOME candidates are empty", () => {
    vi.stubEnv("npm_execpath", "C:/missing/pnpm.cjs");
    vi.stubEnv("APPDATA", "");
    vi.stubEnv("PNPM_HOME", "");

    expect(() =>
      createPnpmCommand(["--version"], { platform: "win32" }),
    ).toThrowError(/Unable to locate pnpm CLI/);
  });
});

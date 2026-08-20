import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecFn } from "./deploy-preflight";
import { runPreflight } from "./deploy-preflight";

type CommandCall = { command: string; args: readonly string[] };

type Scenario = {
  branch?: string;
  head?: string;
  remoteHead?: string;
  status?: string;
  projectListJson?: string;
  projectListThrows?: boolean;
  deploymentListJson?: string;
  deploymentListThrows?: boolean;
  gitHeadThrows?: boolean;
};

const DEFAULT_PROJECT_LIST = JSON.stringify([
  {
    "Project Name": "unrelated-pages-project",
    "Project Domains": "unrelated-pages-project.pages.dev",
    "Git Provider": "Yes",
    "Last Modified": "1 hour ago",
  },
]);

const DEFAULT_DEPLOYMENT_LIST = JSON.stringify([
  {
    Id: "f1ba253d",
    Environment: "Production",
    Branch: "master",
    Source: "19ffad5",
  },
  {
    Id: "9396fed7",
    Environment: "Preview",
    Branch: "main",
    Source: "19ffad5",
  },
]);

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_COMSPEC = process.env["ComSpec"];

afterEach(() => {
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
  if (ORIGINAL_COMSPEC === undefined) {
    delete process.env["ComSpec"];
  } else {
    process.env["ComSpec"] = ORIGINAL_COMSPEC;
  }
  vi.doUnmock("node:child_process");
});

function isDeploymentListCall(args: readonly string[]): boolean {
  return args.includes("deployment") && args.includes("list");
}

function isProjectListCall(args: readonly string[]): boolean {
  return args.includes("project") && args.includes("list");
}

function buildExec(scenario: Scenario): { exec: ExecFn; calls: CommandCall[] } {
  const calls: CommandCall[] = [];
  const exec: ExecFn = (command, args) => {
    calls.push({ command, args });
    if (command === "git") {
      const key = args.join(" ");
      if (key === "rev-parse HEAD") {
        if (scenario.gitHeadThrows) {
          throw new Error("fatal: bad revision");
        }
        return `${scenario.head ?? "abcdef1234567890abcdef1234567890abcdef12"}\n`;
      }
      if (key === "rev-parse --abbrev-ref HEAD") {
        return `${scenario.branch ?? "master"}\n`;
      }
      if (key === "status --porcelain") {
        return scenario.status ?? "";
      }
      if (key === "fetch origin master") {
        return "";
      }
      if (key === "rev-parse origin/master") {
        return `${scenario.remoteHead ?? scenario.head ?? "abcdef1234567890abcdef1234567890abcdef12"}\n`;
      }
      throw new Error(`unexpected git args: ${key}`);
    }
    if (command === "npx") {
      if (isProjectListCall(args)) {
        if (scenario.projectListThrows) {
          throw new Error("wrangler project list exploded");
        }
        return scenario.projectListJson ?? DEFAULT_PROJECT_LIST;
      }
      if (isDeploymentListCall(args)) {
        if (scenario.deploymentListThrows) {
          throw new Error("wrangler deployment list exploded");
        }
        return scenario.deploymentListJson ?? DEFAULT_DEPLOYMENT_LIST;
      }
      throw new Error(`unexpected npx args: ${args.join(" ")}`);
    }
    throw new Error(`unexpected command: ${command}`);
  };
  return { exec, calls };
}

describe("runPreflight", () => {
  it("returns ok=true on a clean master checkout synced with origin", async () => {
    const { exec } = buildExec({});
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.commitSha).toHaveLength(7);
    expect(result.fullSha.startsWith(result.commitSha)).toBe(true);
  });

  it("blocks deploys from non-master branches", async () => {
    const { exec } = buildExec({ branch: "worktree-feature" });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("worktree-feature"))).toBe(
      true,
    );
  });

  it("allows non-master when allowDirty and DEPLOY_ALLOW_NON_MASTER=1", async () => {
    const { exec } = buildExec({ branch: "hotfix", status: " M foo\n" });
    const result = await runPreflight({
      project: "web",
      allowDirty: true,
      exec,
      env: { DEPLOY_ALLOW_NON_MASTER: "1" },
    });
    expect(result.ok).toBe(true);
  });

  it("blocks dirty working trees by default", async () => {
    const { exec } = buildExec({ status: " M apps/web/src/x.astro\n" });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("dirty"))).toBe(true);
  });

  it("blocks when HEAD diverges from origin/master", async () => {
    const { exec } = buildExec({
      head: "1111111111111111111111111111111111111111",
      remoteHead: "2222222222222222222222222222222222222222",
    });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("not in sync"))).toBe(true);
  });

  it("checks stale marketing Pages projects before every production deploy", async () => {
    const { exec, calls } = buildExec({});
    const result = await runPreflight({ project: "api", exec, env: {} });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.command === "npx")).toBe(true);
    expect(calls.some((c) => c.args.includes("deployment"))).toBe(false);
  });

  it("blocks web deploys when stale marketing Pages projects still exist", async () => {
    const { exec } = buildExec({
      projectListJson: JSON.stringify([
        {
          "Project Name": "boardstack-web",
          "Project Domains": "boardstack-web.pages.dev, gavelhouse.app",
        },
        {
          "Project Name": "boardstack",
          "Project Domains": "boardstack.pages.dev",
        },
      ]),
    });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes('Stale marketing Pages project "boardstack"'),
      ),
    ).toBe(true);
  });

  it("blocks api and app deploys when stale marketing Pages projects still exist", async () => {
    const staleProjectListJson = JSON.stringify([
      {
        "Project Name": "boardstack",
        "Project Domains": "boardstack.pages.dev",
      },
    ]);
    const api = await runPreflight({
      project: "api",
      ...buildExec({ projectListJson: staleProjectListJson }),
      env: {},
    });
    const app = await runPreflight({
      project: "app",
      ...buildExec({ projectListJson: staleProjectListJson }),
      env: {},
    });

    expect(api.ok).toBe(false);
    expect(app.ok).toBe(false);
    expect(api.errors.join("\n")).toContain(
      'Stale marketing Pages project "boardstack"',
    );
    expect(app.errors.join("\n")).toContain(
      'Stale marketing Pages project "boardstack"',
    );
  });

  it("blocks web deploys when old frontend Pages projects still exist", async () => {
    const { exec } = buildExec({
      projectListJson: JSON.stringify([
        {
          "Project Name": "boardstack-web",
          "Project Domains": "boardstack-web.pages.dev, gavelhouse.app",
        },
        {
          "Project Name": "boardstack-app",
          "Project Domains": "boardstack-app.pages.dev, my.gavelhouse.app",
        },
      ]),
    });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes('Stale frontend Pages project "boardstack-web"'),
      ),
    ).toBe(true);
  });

  it("blocks web deploys when unable to query Pages project hygiene", async () => {
    const { exec } = buildExec({ projectListThrows: true });
    const result = await runPreflight({ project: "web", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("Unable to query Cloudflare Pages projects"),
      ),
    ).toBe(true);
  });

  it("blocks deploys when Pages project hygiene returns invalid JSON", async () => {
    const { exec } = buildExec({ projectListJson: "not-json" });
    const result = await runPreflight({ project: "app", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("wrangler pages project list did not return valid JSON"),
      ),
    ).toBe(true);
  });

  it("blocks deploys when Pages project hygiene returns an unexpected shape", async () => {
    const { exec } = buildExec({ projectListJson: "{}" });
    const result = await runPreflight({ project: "api", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unexpected shape"))).toBe(
      true,
    );
  });

  it("requires the D1 nonce migration without rewriting historical Postgres migrations", async () => {
    const { exec } = buildExec({});
    const repoRoot = mkdtempSync(join(tmpdir(), "boardstack-preflight-"));
    mkdirSync(join(repoRoot, "apps", "api", "d1-migrations"), {
      recursive: true,
    });
    mkdirSync(join(repoRoot, "apps", "api", "migrations", "meta"), {
      recursive: true,
    });
    writeFileSync(
      join(repoRoot, "apps", "api", "d1-migrations", "0001_ai_sdr_nonces.sql"),
      'CREATE TABLE "ai_sdr_nonces" ("nonce" text NOT NULL);',
    );
    writeFileSync(
      join(repoRoot, "apps", "api", "migrations", "0021_ai_sdr_nonces.sql"),
      'CREATE TABLE "ai_sdr_nonces" ("nonce" text NOT NULL);',
    );
    writeFileSync(
      join(repoRoot, "apps", "api", "migrations", "meta", "_journal.json"),
      JSON.stringify({ entries: [{ tag: "0021_ai_sdr_nonces" }] }),
    );

    const result = await runPreflight({
      project: "api",
      exec,
      env: {},
      repoRoot,
    });

    rmSync(repoRoot, { recursive: true, force: true });

    expect(result.ok).toBe(true);
  });

  it("blocks deploys when the D1 nonce migration is missing", async () => {
    const { exec } = buildExec({});
    const repoRoot = mkdtempSync(join(tmpdir(), "boardstack-preflight-"));
    mkdirSync(join(repoRoot, "apps", "api"), { recursive: true });

    const result = await runPreflight({
      project: "api",
      exec,
      env: {},
      repoRoot,
    });

    rmSync(repoRoot, { recursive: true, force: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Missing apps/api/d1-migrations/0001_ai_sdr_nonces.sql for AI-SDR nonce storage.",
    );
  });

  it("reports an error when git HEAD cannot be resolved", async () => {
    const { exec } = buildExec({ gitHeadThrows: true });
    const result = await runPreflight({ project: "api", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("HEAD"))).toBe(true);
  });

  it("reports an error when branch lookup fails", async () => {
    const exec: ExecFn = (command, args) => {
      if (command === "git") {
        const key = args.join(" ");
        if (key === "rev-parse HEAD")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        if (key === "rev-parse --abbrev-ref HEAD") throw new Error("no branch");
        if (key === "status --porcelain") return "";
        if (key === "fetch origin master") return "";
        if (key === "rev-parse origin/master")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
      }
      if (command === "npx") {
        if (isProjectListCall(args)) return DEFAULT_PROJECT_LIST;
        if (isDeploymentListCall(args)) return DEFAULT_DEPLOYMENT_LIST;
      }
      throw new Error(`unexpected: ${command}`);
    };
    const result = await runPreflight({ project: "app", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("current branch"))).toBe(true);
  });

  it("reports an error when status lookup fails", async () => {
    const exec: ExecFn = (command, args) => {
      if (command === "git") {
        const key = args.join(" ");
        if (key === "rev-parse HEAD")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        if (key === "rev-parse --abbrev-ref HEAD") return "master\n";
        if (key === "status --porcelain") throw new Error("status boom");
        if (key === "fetch origin master") return "";
        if (key === "rev-parse origin/master")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
      }
      if (command === "npx") {
        if (isProjectListCall(args)) return DEFAULT_PROJECT_LIST;
        if (isDeploymentListCall(args)) return DEFAULT_DEPLOYMENT_LIST;
      }
      throw new Error(`unexpected: ${command}`);
    };
    const result = await runPreflight({ project: "app", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("working tree"))).toBe(true);
  });

  it("reports an error when fetch or remote lookup fails", async () => {
    const exec: ExecFn = (command, args) => {
      if (command === "git") {
        const key = args.join(" ");
        if (key === "rev-parse HEAD")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        if (key === "rev-parse --abbrev-ref HEAD") return "master\n";
        if (key === "status --porcelain") return "";
        if (key === "fetch origin master") throw new Error("no network");
        if (key === "rev-parse origin/master") return "";
      }
      if (command === "npx") {
        if (isProjectListCall(args)) return DEFAULT_PROJECT_LIST;
        if (isDeploymentListCall(args)) return DEFAULT_DEPLOYMENT_LIST;
      }
      throw new Error(`unexpected: ${command}`);
    };
    const result = await runPreflight({ project: "app", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("sync with origin"))).toBe(
      true,
    );
  });

  it("falls back to process.env when env option is omitted", async () => {
    const { exec } = buildExec({ branch: "worktree-x" });
    // Omit env explicitly — forces the ?? process.env branch.
    const result = await runPreflight({ project: "api", exec });
    // Will fail because branch != master and process.env.DEPLOY_ALLOW_NON_MASTER
    // is not "1" in this test process.
    expect(result.ok).toBe(false);
  });

  it("invokes defaultExec when exec is omitted", async () => {
    // Running runPreflight against the live repo would read real git state;
    // that's a valid exercise of the default exec path. Expect either ok=true
    // or ok=false — we only care that defaultExec was reached without throwing.
    vi.resetModules();
    Object.defineProperty(process, "platform", { value: "linux" });
    const execFileSync = vi.fn(
      (_command: string, args: readonly string[]): string => {
        const key = args.join(" ");
        if (key === "wrangler pages project list --json") {
          return DEFAULT_PROJECT_LIST;
        }
        if (key === "rev-parse HEAD") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        if (key === "rev-parse --abbrev-ref HEAD") return "master\n";
        if (key === "fetch origin master") return "";
        if (key === "rev-parse origin/master") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        throw new Error(`unexpected: ${key}`);
      },
    );
    vi.doMock("node:child_process", () => ({ execFileSync }));
    const { runPreflight: runPreflightWithDefaultExec } =
      await import("./deploy-preflight");

    const result = await runPreflightWithDefaultExec({
      project: "api",
      allowDirty: true,
      env: { DEPLOY_ALLOW_NON_MASTER: "1" },
    });
    expect(result.ok).toBe(true);
    expect(result.fullSha.length).toBeGreaterThan(0);
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "master"],
      { encoding: "utf-8" },
    );
  });

  it("uses the Windows command shim when exec is omitted on win32", async () => {
    vi.resetModules();
    const execFileSync = vi.fn(
      (_command: string, args: readonly string[]): string => {
        const shellCommand = args.at(-1);
        if (shellCommand === "git rev-parse HEAD") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        if (shellCommand === "git rev-parse --abbrev-ref HEAD") {
          return "master\n";
        }
        if (shellCommand === "git status --porcelain") return "";
        if (shellCommand === "git fetch origin master") return "";
        if (shellCommand === "git rev-parse origin/master") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        if (shellCommand === "npx wrangler pages project list --json") {
          return DEFAULT_PROJECT_LIST;
        }
        throw new Error(`unexpected shell command: ${shellCommand}`);
      },
    );
    vi.doMock("node:child_process", () => ({ execFileSync }));
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["ComSpec"] = "C:\\Windows\\System32\\cmd.exe";

    const { runPreflight: runWindowsPreflight } =
      await import("./deploy-preflight");
    const result = await runWindowsPreflight({
      project: "api",
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "git rev-parse HEAD"],
      { encoding: "utf-8" },
    );
  });

  it("falls back to cmd.exe for the Windows command shim", async () => {
    vi.resetModules();
    const execFileSync = vi.fn(
      (_command: string, args: readonly string[]): string => {
        const shellCommand = args.at(-1);
        if (shellCommand === "git rev-parse HEAD") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        if (shellCommand === "git rev-parse --abbrev-ref HEAD") {
          return "master\n";
        }
        if (shellCommand === "git status --porcelain") return "";
        if (shellCommand === "git fetch origin master") return "";
        if (shellCommand === "git rev-parse origin/master") {
          return "abcdef1234567890abcdef1234567890abcdef12\n";
        }
        if (shellCommand === "npx wrangler pages project list --json") {
          return DEFAULT_PROJECT_LIST;
        }
        throw new Error(`unexpected shell command: ${shellCommand}`);
      },
    );
    vi.doMock("node:child_process", () => ({ execFileSync }));
    Object.defineProperty(process, "platform", { value: "win32" });
    delete process.env["ComSpec"];

    const { runPreflight: runWindowsPreflight } =
      await import("./deploy-preflight");
    const result = await runWindowsPreflight({
      project: "api",
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      "cmd.exe",
      ["/d", "/s", "/c", "git rev-parse HEAD"],
      { encoding: "utf-8" },
    );
  });

  it("uses a non-Error thrown value in error formatting", async () => {
    const exec: ExecFn = (command, args) => {
      if (command === "git" && args.join(" ") === "rev-parse HEAD") {
        throw "string-error";
      }
      if (command === "git") {
        const key = args.join(" ");
        if (key === "rev-parse --abbrev-ref HEAD") return "master\n";
        if (key === "status --porcelain") return "";
        if (key === "fetch origin master") return "";
        if (key === "rev-parse origin/master")
          return "abcdef1234567890abcdef1234567890abcdef12\n";
      }
      if (command === "npx") {
        if (isProjectListCall(args)) return DEFAULT_PROJECT_LIST;
        if (isDeploymentListCall(args)) return DEFAULT_DEPLOYMENT_LIST;
      }
      throw new Error(`unexpected: ${command}`);
    };
    const result = await runPreflight({ project: "app", exec, env: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("string-error"))).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));
import {
  createDeployPlan,
  getAllProjects,
  getTouchedFiles,
  mergeTouchedFileLists,
  normalizeGitPath,
  parseDeployTouchedArgs,
  parseGitDiffOutput,
  runDeployCommand,
} from "./deploy-touched";

describe("deploy touched helpers", () => {
  const originalPlatform = process.platform;
  const originalComSpec = process.env["ComSpec"];

  afterEach(() => {
    mockExecFileSync.mockReset();
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalComSpec === undefined) {
      delete process.env["ComSpec"];
    } else {
      process.env["ComSpec"] = originalComSpec;
    }
    delete process.env["DEPLOY_FROM"];
  });

  it("normalizes Windows paths to git-style paths", () => {
    expect(normalizeGitPath(".\\apps\\web\\src\\pages\\index.astro")).toBe(
      "apps/web/src/pages/index.astro",
    );
  });

  it("deploys only the API when API files change", () => {
    expect(createDeployPlan(["apps/api/src/index.ts"]).projects).toEqual([
      "api",
    ]);
  });

  it("deploys marketing web for apps/web changes", () => {
    expect(
      createDeployPlan(["apps/web/src/pages/index.astro"]).projects,
    ).toEqual(["web"]);
  });

  it("deploys every project when shared workspace inputs change", () => {
    expect(createDeployPlan(["packages/shared/src/index.ts"]).projects).toEqual(
      ["api", "app", "web"],
    );
  });

  it("deploys only the dashboard app for app changes", () => {
    expect(createDeployPlan(["apps/app/src/routes/_app.tsx"]).projects).toEqual(
      ["app"],
    );
  });

  it("ignores docs-only changes", () => {
    expect(createDeployPlan(["docs/roadmap.md"]).projects).toEqual([]);
  });

  it("deploys app and web when shared design tokens change", () => {
    expect(
      createDeployPlan(["packages/design/src/app-theme.css"]).projects,
    ).toEqual(["app", "web"]);
  });

  it("parses diff output without blank lines", () => {
    expect(
      parseGitDiffOutput("apps/api/src/index.ts\r\n\r\npackage.json\n"),
    ).toEqual(["apps/api/src/index.ts", "package.json"]);
  });

  it("keeps untracked project files in touched file lists", () => {
    expect(
      createDeployPlan(
        mergeTouchedFileLists(
          "docs/readme.md\n",
          "",
          "apps/web/src/new-page.astro\n",
        ),
      ).projects,
    ).toEqual(["web"]);
  });

  it("parses deploy arguments", () => {
    expect(parseDeployTouchedArgs(["--from", "HEAD~1", "--dry-run"])).toEqual({
      all: false,
      dryRun: true,
      fromRef: "HEAD~1",
    });
  });

  it("parses --all and DEPLOY_FROM defaults", () => {
    process.env["DEPLOY_FROM"] = "HEAD~2";

    expect(parseDeployTouchedArgs(["--all"])).toEqual({
      all: true,
      dryRun: false,
      fromRef: "HEAD~2",
    });
  });

  it("rejects missing --from values and unknown flags", () => {
    expect(() => parseDeployTouchedArgs(["--from"])).toThrow(
      "Missing value for --from.",
    );
    expect(() => parseDeployTouchedArgs(["--wat"])).toThrow(
      "Unknown argument: --wat",
    );
  });

  it("reads committed, working tree, and untracked touched files", () => {
    mockExecFileSync
      .mockReturnValueOnce("apps/api/src/index.ts\n")
      .mockReturnValueOnce("apps/app/src/routes/_app.tsx\n")
      .mockReturnValueOnce("apps/web/src/pages/new.astro\n");

    expect(getTouchedFiles("origin/master")).toEqual([
      "apps/api/src/index.ts",
      "apps/app/src/routes/_app.tsx",
      "apps/web/src/pages/new.astro",
    ]);
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      1,
      "git",
      ["diff", "--name-only", "--diff-filter=ACMRTUXB", "origin/master...HEAD"],
      { encoding: "utf-8" },
    );
  });

  it("runs deploy commands directly on non-Windows platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    runDeployCommand("web");

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "pnpm",
      ["run", "deploy:web"],
      { stdio: "inherit" },
    );
  });

  it("runs deploy commands through cmd on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["ComSpec"] = "C:\\Windows\\System32\\cmd.exe";

    runDeployCommand("api");

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d","/s","/c", "pnpm run deploy:api"],
      { stdio: "inherit" },
    );
  });

  it("returns all projects in deploy order", () => {
    expect(getAllProjects()).toEqual(["api", "app", "web"]);
  });
});

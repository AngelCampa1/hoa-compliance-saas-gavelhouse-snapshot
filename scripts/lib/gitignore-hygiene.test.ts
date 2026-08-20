import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { CommandResult, CommandRunner } from "./bootstrap.js";
import { findTrackedIgnoredFiles } from "./gitignore-hygiene.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function ok(stdout: string): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

/** Real git, no shell, with stdin wired through. */
const realRunner: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, args as string[], {
    cwd: options?.cwd,
    input: options?.input,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

function makeRunner(options: {
  tracked?: string;
  ignored?: string;
  lsFilesStatus?: number;
  checkIgnoreStatus?: number;
}): {
  runner: CommandRunner;
  calls: string[][];
  inputs: (string | undefined)[];
} {
  const calls: string[][] = [];
  const inputs: (string | undefined)[] = [];
  const runner: CommandRunner = (command, args, runnerOptions) => {
    calls.push([command, ...args]);
    inputs.push(runnerOptions?.input);
    if (args[0] === "ls-files") {
      const status = options.lsFilesStatus ?? 0;
      return status === 0
        ? ok(options.tracked ?? "")
        : { status, stdout: "", stderr: "not a git repository" };
    }
    // `git check-ignore` exits 1 when nothing matched, which is not a failure.
    const status = options.checkIgnoreStatus ?? (options.ignored ? 0 : 1);
    return status === 0 || status === 1
      ? { status, stdout: options.ignored ?? "", stderr: "" }
      : { status, stdout: "", stderr: "fatal: bad pathspec" };
  };
  return { runner, calls, inputs };
}

describe("findTrackedIgnoredFiles", () => {
  it("reports nothing when no tracked file is ignored", () => {
    const { runner } = makeRunner({ tracked: "README.md\0src/index.ts\0" });
    expect(findTrackedIgnoredFiles(runner, "/repo")).toEqual([]);
  });

  it("reports the tracked files .gitignore matches", () => {
    const { runner } = makeRunner({
      tracked: "README.md\0apps/api/src/routes/reports/index.ts\0",
      ignored: "apps/api/src/routes/reports/index.ts\0",
    });
    expect(findTrackedIgnoredFiles(runner, "/repo")).toEqual([
      "apps/api/src/routes/reports/index.ts",
    ]);
  });

  it("asks git to ignore its own index, or every answer would be no", () => {
    const { runner, calls } = makeRunner({ tracked: "README.md\0" });

    findTrackedIgnoredFiles(runner, "/repo");

    const check = calls.find((call) => call.includes("check-ignore"));
    expect(check).toContain("--no-index");
  });

  it("hands the paths to git over stdin, never as arguments", () => {
    const tracked = "README.md\0docs/a file.md\0";
    const { runner, calls, inputs } = makeRunner({ tracked });

    findTrackedIgnoredFiles(runner, "/repo");

    const index = calls.findIndex((call) => call.includes("check-ignore"));
    // A path list long enough to overflow a command line, or holding a space,
    // survives stdin intact — as arguments it would not.
    expect(inputs[index]).toBe(tracked);
    expect(calls[index]).not.toContain("README.md");
  });

  it("asks nothing of git when the repository tracks no files", () => {
    const { runner, calls } = makeRunner({ tracked: "" });

    expect(findTrackedIgnoredFiles(runner, "/repo")).toEqual([]);
    expect(calls.filter((call) => call.includes("check-ignore"))).toEqual([]);
  });

  it("fails loudly when the tracked-file listing fails", () => {
    const { runner } = makeRunner({ lsFilesStatus: 128 });
    expect(() => findTrackedIgnoredFiles(runner, "/repo")).toThrow(
      /git ls-files failed in \/repo: not a git repository/,
    );
  });

  it("fails loudly when the ignore check itself fails", () => {
    const { runner } = makeRunner({
      tracked: "README.md\0",
      checkIgnoreStatus: 128,
    });
    expect(() => findTrackedIgnoredFiles(runner, "/repo")).toThrow(
      /git check-ignore failed in \/repo: fatal: bad pathspec/,
    );
  });

  it("holds for this repository: nothing tracked is also ignored", () => {
    // The invariant itself, against real git. A tracked file that .gitignore
    // matches survives here but disappears from any tree rebuilt with
    // `git add`, which is how the snapshot export lost its reports feature.
    expect(findTrackedIgnoredFiles(realRunner, REPO_ROOT)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import path from "node:path";

import type { CommandResult, CommandRunner } from "./bootstrap.js";
import {
  METRICS_ANCHOR,
  assertExportIsComplete,
  assertSourceIsSnapshotReady,
  buildSourceHistory,
  defaultDestination,
  git,
  insertSnapshotNotice,
  renderSnapshotNotice,
  renderSourceHistory,
  runSnapshot,
  type SnapshotFs,
  type SourceHistory,
} from "./snapshot.js";

const OK: CommandResult = { status: 0, stdout: "", stderr: "" };

function ok(stdout: string): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

interface RunnerOptions {
  status?: string;
  branch?: string;
  head?: string;
  commits?: string;
  dates?: string;
  shortlog?: string;
  failOn?: string;
  tree?: string;
  exported?: string;
}

function makeRunner(options: RunnerOptions = {}): {
  runner: CommandRunner;
  calls: string[][];
} {
  const calls: string[][] = [];

  const runner: CommandRunner = (command, args) => {
    calls.push([command, ...args]);
    const joined = args.join(" ");
    if (options.failOn && joined.startsWith(options.failOn)) {
      return { status: 1, stdout: "", stderr: "boom" };
    }
    if (command === "tar") return OK;

    const [subcommand] = args;
    // NUL-separated with a trailing NUL, the way `git -z` really writes it.
    if (subcommand === "ls-tree") return ok(options.tree ?? "README.md\0");
    if (subcommand === "ls-files") {
      return ok(options.exported ?? "README.md\0docs/source-history.json\0");
    }
    if (subcommand === "status") return ok(options.status ?? "");
    if (subcommand === "rev-parse" && args.includes("--abbrev-ref")) {
      return ok(`${options.branch ?? "master"}\n`);
    }
    if (subcommand === "rev-parse")
      return ok(`${options.head ?? "abcdef1234"}\n`);
    if (subcommand === "rev-list") return ok(`${options.commits ?? "671"}\n`);
    if (subcommand === "log") {
      return ok(options.dates ?? "2026-06-17\n2026-05-01\n2026-04-14\n");
    }
    if (subcommand === "shortlog") {
      return ok(options.shortlog ?? "   528\tAngel Campa <a@example.com>\n");
    }
    return OK;
  };

  return { runner, calls };
}

function makeFs(files: Record<string, string> = {}): {
  fs: SnapshotFs;
  written: Record<string, string>;
  existing: Set<string>;
} {
  const written: Record<string, string> = {};
  const existing = new Set<string>();

  const fs: SnapshotFs = {
    exists: (target) => existing.has(target),
    mkdir: (target) => existing.add(target),
    readFile: (target) => {
      const contents = files[path.basename(target)];
      if (contents === undefined) throw new Error(`missing file: ${target}`);
      return contents;
    },
    writeFile: (target, contents) => {
      written[path.basename(target)] = contents;
    },
    removeFile: (target) => existing.delete(target),
  };

  return { fs, written, existing };
}

const HISTORY: SourceHistory = {
  commits: 671,
  firstCommit: "2026-04-14",
  lastCommit: "2026-06-17",
  authors: [{ email: "a@example.com", commits: 671 }],
  sourceCommit: "5772dcc90ed5f591eee80b1345935addd66ac16f",
  exportedAt: "2026-08-07",
};

const README = `# Gavelhouse\n\nIntro paragraph.\n\n${METRICS_ANCHOR}\n\n| a | b |\n`;

describe("git", () => {
  it("returns stdout on success", () => {
    const { runner } = makeRunner({ head: "deadbeef" });
    expect(git(runner, "/src", ["rev-parse", "HEAD"]).trim()).toBe("deadbeef");
  });

  it("throws with the command's own stderr on failure", () => {
    const { runner } = makeRunner({ failOn: "rev-parse" });
    expect(() => git(runner, "/src", ["rev-parse", "HEAD"])).toThrow(/boom/);
  });
});

describe("assertSourceIsSnapshotReady", () => {
  it("accepts a clean master checkout", () => {
    const { runner } = makeRunner();
    expect(() => assertSourceIsSnapshotReady(runner, "/src")).not.toThrow();
  });

  it("refuses a dirty working tree", () => {
    const { runner } = makeRunner({ status: " M apps/web/index.astro\n" });
    expect(() => assertSourceIsSnapshotReady(runner, "/src")).toThrow(
      /dirty working tree/,
    );
  });

  it("refuses a branch other than master", () => {
    const { runner } = makeRunner({ branch: "feature/x" });
    expect(() => assertSourceIsSnapshotReady(runner, "/src")).toThrow(
      /expected "master"/,
    );
  });
});

describe("buildSourceHistory", () => {
  it("reads commit count, date range, and email-normalized authors", () => {
    const { runner } = makeRunner({
      head: "5772dcc9\n",
      commits: "671",
      dates: "2026-06-17\n2026-05-01\n2026-04-14\n",
      shortlog:
        "   528\tAngel Campa <a@example.com>\n    21\tPriorOrgName <a@example.com>\n",
    });

    const history = buildSourceHistory(runner, "/src", new Date("2026-08-07"));

    expect(history.commits).toBe(671);
    expect(history.firstCommit).toBe("2026-04-14");
    expect(history.lastCommit).toBe("2026-06-17");
    expect(history.exportedAt).toBe("2026-08-07");
    // Two display names, one address: the rename must not imply two people.
    expect(history.authors).toEqual([{ email: "a@example.com", commits: 549 }]);
  });

  it("tolerates an empty log", () => {
    const { runner } = makeRunner({ dates: "", commits: "0" });
    const history = buildSourceHistory(runner, "/src", new Date("2026-08-07"));
    expect(history.firstCommit).toBe("");
    expect(history.lastCommit).toBe("");
  });
});

describe("renderSnapshotNotice", () => {
  it("states the source commit and that the History row is not this repo", () => {
    const notice = renderSnapshotNotice(HISTORY);
    expect(notice).toContain("## About this snapshot");
    expect(notice).toContain("5772dcc9");
    expect(notice).toContain("671");
    expect(notice).toContain("2026-04-14");
    expect(notice).toContain("docs/source-history.json");
  });
});

describe("insertSnapshotNotice", () => {
  it("places the notice directly above the metrics anchor", () => {
    const result = insertSnapshotNotice(README, renderSnapshotNotice(HISTORY));
    expect(result.indexOf("## About this snapshot")).toBeLessThan(
      result.indexOf(METRICS_ANCHOR),
    );
    expect(result).toContain(METRICS_ANCHOR);
  });

  it("throws when the anchor is gone rather than guessing a position", () => {
    expect(() => insertSnapshotNotice("# Gavelhouse\n", "notice")).toThrow(
      /no <!-- METRICS:START --> anchor/,
    );
  });
});

describe("assertExportIsComplete", () => {
  it("accepts an export holding the source tree plus the history file", () => {
    const { runner } = makeRunner({
      tree: "README.md\0apps/api/src/routes/reports/trialBalance.ts\0",
      exported:
        "README.md\0apps/api/src/routes/reports/trialBalance.ts\0docs/source-history.json\0",
    });
    expect(() =>
      assertExportIsComplete(runner, "/src", "/dest", "abc1234"),
    ).not.toThrow();
  });

  it("catches files .gitignore dropped from the export", () => {
    // The real regression: `reports/` is gitignored but tracked in the source,
    // so a fresh `git add -A` silently omitted the whole reports feature.
    const { runner } = makeRunner({
      tree: "README.md\0apps/api/src/routes/reports/trialBalance.ts\0",
      exported: "README.md\0docs/source-history.json\0",
    });
    expect(() =>
      assertExportIsComplete(runner, "/src", "/dest", "abc1234"),
    ).toThrow(/Missing 1: apps\/api\/src\/routes\/reports\/trialBalance\.ts/);
  });

  it("catches files the export gained that the source never had", () => {
    const { runner } = makeRunner({
      tree: "README.md\0",
      exported:
        "README.md\0docs/source-history.json\0node_modules/x/index.js\0",
    });
    expect(() =>
      assertExportIsComplete(runner, "/src", "/dest", "abc1234"),
    ).toThrow(/Unexpected 1: node_modules\/x\/index\.js/);
  });

  it("reads paths that a line-separated listing would have quoted", () => {
    // git escapes non-ASCII in its default output, and the two listings come
    // from two different repositories; -z is what keeps them comparable.
    const { runner } = makeRunner({
      tree: "docs/reunión.md\0",
      exported: "docs/reunión.md\0docs/source-history.json\0",
    });
    expect(() =>
      assertExportIsComplete(runner, "/src", "/dest", "abc1234"),
    ).not.toThrow();
  });
});

describe("defaultDestination", () => {
  it("resolves to a sibling of the repository", () => {
    // Compared by parts rather than as a literal: path.resolve qualifies a
    // rooted path with the current drive on Windows.
    const sourceRoot = path.join(path.sep, "code", "boardstack");
    const destination = defaultDestination(sourceRoot);

    expect(path.basename(destination)).toBe("gavelhouse-snapshot");
    expect(path.dirname(destination)).toBe(path.resolve(sourceRoot, ".."));
  });
});

describe("renderSourceHistory", () => {
  it("serializes with two-space indent and a trailing newline", () => {
    const serialized = renderSourceHistory(HISTORY);
    expect(serialized.endsWith("}\n")).toBe(true);
    expect(serialized).toContain('  "commits": 671');
    expect(JSON.parse(serialized)).toEqual(HISTORY);
  });
});

describe("runSnapshot", () => {
  const base = {
    sourceRoot: "/src",
    destination: "/dest",
    now: () => new Date("2026-08-07"),
    log: () => undefined,
  };

  it("exports, records history, patches the README, and commits once", async () => {
    const { runner, calls } = makeRunner();
    const { fs, written } = makeFs({ "README.md": README });

    const destination = await runSnapshot({ ...base, runner, fs });

    expect(destination).toBe("/dest");
    expect(JSON.parse(written["source-history.json"] ?? "").commits).toBe(671);
    expect(written["README.md"]).toContain("## About this snapshot");

    const commands = calls.map((call) => call.join(" "));
    expect(commands.some((c) => c.startsWith("git archive"))).toBe(true);
    // Relative, so GNU tar cannot read a drive-letter colon as a remote host.
    expect(commands).toContain("tar -xf .snapshot-export.tar");
    expect(commands.filter((c) => c.includes("commit -m"))).toHaveLength(1);
    expect(commands.some((c) => c === "git init -b main")).toBe(true);
    // Without --force the fresh repository re-applies .gitignore to a tree git
    // already tracks, and drops every file under reports/ and screenshots/.
    expect(commands).toContain("git add -A --force");
  });

  it("checks the export before writing the commit", async () => {
    const { runner, calls } = makeRunner({
      tree: "README.md\0apps/api/src/routes/reports/trialBalance.ts\0",
      exported: "README.md\0docs/source-history.json\0",
    });
    const { fs } = makeFs({ "README.md": README });

    await expect(runSnapshot({ ...base, runner, fs })).rejects.toThrow(
      /Snapshot does not match the source tree/,
    );
    // A rejected snapshot should leave no commit behind to inspect or push.
    expect(calls.some((call) => call.includes("commit"))).toBe(false);
  });

  it("keeps the commit message as one argument", async () => {
    const { runner, calls } = makeRunner();
    const { fs } = makeFs({ "README.md": README });

    await runSnapshot({ ...base, runner, fs });

    const commit = calls.find((call) => call.includes("commit"));
    // The message must survive as a single argv entry; a shell-joined runner
    // would split it and produce a commit named "Gavelhouse".
    expect(commit?.at(-1)).toMatch(/^Gavelhouse snapshot at [0-9a-f]{8}$/);
  });

  it("refuses when the destination already exists", async () => {
    const { runner } = makeRunner();
    const { fs, existing } = makeFs({ "README.md": README });
    existing.add("/dest");

    await expect(runSnapshot({ ...base, runner, fs })).rejects.toThrow(
      /Destination already exists/,
    );
  });

  it("removes the intermediate tarball even when extraction fails", async () => {
    const { runner } = makeRunner({ failOn: "-xf" });
    const { fs, existing } = makeFs({ "README.md": README });
    const removed: string[] = [];
    const trackingFs: SnapshotFs = {
      ...fs,
      removeFile: (target) => {
        removed.push(target);
        existing.delete(target);
      },
    };

    await expect(
      runSnapshot({ ...base, runner, fs: trackingFs }),
    ).rejects.toThrow(/tar extraction failed/);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain(".snapshot-export.tar");
  });

  it("logs progress through the injected logger", async () => {
    const { runner } = makeRunner();
    const { fs } = makeFs({ "README.md": README });
    const lines: string[] = [];

    await runSnapshot({ ...base, runner, fs, log: (m) => lines.push(m) });

    expect(lines.some((line) => line.includes("Snapshot built at"))).toBe(true);
  });
});

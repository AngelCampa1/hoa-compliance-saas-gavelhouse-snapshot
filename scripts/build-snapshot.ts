import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import type { CommandRunner } from "./lib/bootstrap";
import {
  defaultDestination,
  runSnapshot,
  type SnapshotFs,
} from "./lib/snapshot";

/**
 * Runs `git` and `tar` directly, without the cmd.exe shim in
 * scripts/lib/bootstrap.ts.
 *
 * That shim exists because `docker` and `pnpm` are `.cmd` files on Windows and
 * need shell resolution, and it works by joining the argv into a single string.
 * `git` and `tar` are real executables, so they need no shell — and routing
 * through one here would be actively wrong: joining on spaces would split the
 * commit message into four separate arguments.
 */
const runner: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, args as string[], {
    cwd: options?.cwd,
    env: options?.env,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr:
      (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : ""),
  };
};

const fs: SnapshotFs = {
  exists: (target) => existsSync(target),
  mkdir: (target) => {
    mkdirSync(target, { recursive: true });
  },
  readFile: (target) => readFileSync(target, "utf8"),
  writeFile: (target, contents) => {
    writeFileSync(target, contents, "utf8");
  },
  removeFile: (target) => {
    rmSync(target, { force: true });
  },
};

const sourceRoot = process.cwd();

runSnapshot({
  sourceRoot,
  destination: process.argv[2] ?? defaultDestination(sourceRoot),
  runner,
  fs,
  log: (message) => {
    console.log(message);
  },
  now: () => new Date(),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

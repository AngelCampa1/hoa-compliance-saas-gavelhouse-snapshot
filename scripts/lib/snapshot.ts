import path from "node:path";

import type { CommandRunner } from "./bootstrap.js";
import { SOURCE_HISTORY_PATH, parseShortlog } from "./metrics.js";

/**
 * Builds a single-commit export of the repository for portfolio use.
 *
 * The published artifact is a snapshot, not a mirror: it carries the working
 * tree but none of the history. That is a deliberate tradeoff — it means no
 * history needs scrubbing before publication — but it costs the repository
 * every git-derived number in its own README. `docs/source-history.json`
 * carries those figures across the boundary so the claims stay true and remain
 * checkable against the source commit this was taken from.
 */

/** Written into the export so `collectGit` can report the source's history. */
export type SourceHistory = {
  commits: number;
  firstCommit: string;
  lastCommit: string;
  authors: Array<{ email: string; commits: number }>;
  sourceCommit: string;
  exportedAt: string;
};

export type SnapshotFs = {
  exists: (target: string) => boolean;
  mkdir: (target: string) => void;
  readFile: (target: string) => string;
  writeFile: (target: string, contents: string) => void;
  removeFile: (target: string) => void;
};

/**
 * Every dependency is required, not defaulted. The real filesystem, process
 * spawning, clock, and console live in scripts/build-snapshot.ts; this module
 * stays pure so all of it is exercised in tests rather than only in production.
 */
export type SnapshotOptions = {
  sourceRoot: string;
  destination: string;
  runner: CommandRunner;
  fs: SnapshotFs;
  log: (message: string) => void;
  now: () => Date;
};

/** Where a snapshot lands by default: a sibling of the repository. */
export function defaultDestination(sourceRoot: string): string {
  return path.resolve(sourceRoot, "..", "gavelhouse-snapshot");
}

/** Anchor the snapshot notice sits above, so it explains the History row. */
export const METRICS_ANCHOR = "<!-- METRICS:START -->";

/**
 * Runs a git command in `cwd` and returns stdout, throwing with the command's
 * own stderr on failure. Snapshot steps are not retryable — a failure part way
 * through leaves a half-built export — so every one of them fails loudly.
 */
export function git(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
): string {
  const result = runner("git", args, { cwd });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/**
 * Refuses to snapshot anything ambiguous.
 *
 * A snapshot is a claim about what the code looked like at one commit. Built
 * from a dirty tree it silently includes work that commit does not contain, and
 * built from a side branch it misrepresents which commit it came from — in both
 * cases the recorded `sourceCommit` would be a lie that nobody can detect later.
 */
export function assertSourceIsSnapshotReady(
  runner: CommandRunner,
  sourceRoot: string,
): void {
  const status = git(runner, sourceRoot, ["status", "--porcelain"]).trim();
  if (status !== "") {
    throw new Error(
      `Refusing to snapshot a dirty working tree. Commit or discard first:\n${status}`,
    );
  }

  const branch = git(runner, sourceRoot, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]).trim();
  if (branch !== "master") {
    throw new Error(
      `Refusing to snapshot from branch "${branch}"; expected "master".`,
    );
  }
}

/** Reads the source repository's real history for the export to carry. */
export function buildSourceHistory(
  runner: CommandRunner,
  sourceRoot: string,
  now: Date,
): SourceHistory {
  const sourceCommit = git(runner, sourceRoot, ["rev-parse", "HEAD"]).trim();
  const commits = Number(
    git(runner, sourceRoot, ["rev-list", "--count", "HEAD"]).trim(),
  );
  const dates = git(runner, sourceRoot, ["log", "--format=%ad", "--date=short"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return {
    commits,
    firstCommit: dates.at(-1) ?? "",
    lastCommit: dates[0] ?? "",
    // Normalized by email, matching collectGit: the same person committed under
    // more than one display name, and an account rename never rewrites the
    // commits it already authored.
    authors: parseShortlog(
      git(runner, sourceRoot, ["shortlog", "-sne", "HEAD"]),
    ),
    sourceCommit,
    exportedAt: now.toISOString().slice(0, 10),
  };
}

/** The section explaining why this repository has exactly one commit. */
export function renderSnapshotNotice(history: SourceHistory): string {
  return [
    "## About this snapshot",
    "",
    "This repository is a single-commit export of a private repository, taken",
    `at commit \`${history.sourceCommit.slice(0, 8)}\` on ${history.exportedAt}.`,
    "It holds the complete working tree and none of the history.",
    "",
    `The History row below describes that source repository — ${history.commits}`,
    `commits from ${history.firstCommit} to ${history.lastCommit} — not this`,
    "export, which has one. Those figures are recorded in",
    `[\`${SOURCE_HISTORY_PATH}\`](${SOURCE_HISTORY_PATH}) and read from there by`,
    "the metrics generator, so every other number on this page is still",
    "reproducible with `pnpm run metrics:generate`.",
    "",
  ].join("\n");
}

/**
 * Places the notice directly above the metrics table it qualifies. The anchor
 * is required rather than optional: if the README no longer has a metrics
 * block, the notice's whole subject is gone and guessing a position would bury
 * the one disclosure a reader needs.
 */
export function insertSnapshotNotice(readme: string, notice: string): string {
  if (!readme.includes(METRICS_ANCHOR)) {
    throw new Error(
      `Cannot place the snapshot notice: README.md has no ${METRICS_ANCHOR} anchor.`,
    );
  }
  return readme.replace(METRICS_ANCHOR, `${notice}\n${METRICS_ANCHOR}`);
}

/** Serializes the history file the way Prettier would, LF and trailing newline. */
export function renderSourceHistory(history: SourceHistory): string {
  return `${JSON.stringify(history, null, 2)}\n`;
}

export async function runSnapshot(options: SnapshotOptions): Promise<string> {
  const { sourceRoot, destination, runner, fs, log, now } = options;

  if (fs.exists(destination)) {
    throw new Error(
      `Destination already exists: ${destination}. Remove it deliberately first.`,
    );
  }

  assertSourceIsSnapshotReady(runner, sourceRoot);
  const history = buildSourceHistory(runner, sourceRoot, now());
  log(`Snapshotting ${history.sourceCommit.slice(0, 8)} -> ${destination}`);

  fs.mkdir(destination);

  // Export through a tar file rather than a pipe. `git archive` emits binary on
  // stdout, and the command runner decodes stdout as UTF-8 — piping it through
  // would corrupt every one of the PNGs in docs/screenshots.
  //
  // The tarball is named relative to the destination and tar is run from there.
  // An absolute Windows path would not survive the trip: GNU tar reads the
  // drive-letter colon in `D:/...` as a host separator and tries to resolve `D`
  // as a remote machine. git itself has no such problem, so it still gets the
  // absolute path.
  const TARBALL_NAME = ".snapshot-export.tar";
  const tarball = path.join(destination, TARBALL_NAME);
  try {
    git(runner, sourceRoot, [
      "archive",
      "--format=tar",
      "-o",
      tarball,
      history.sourceCommit,
    ]);
    const extract = runner("tar", ["-xf", TARBALL_NAME], { cwd: destination });
    if (extract.status !== 0) {
      throw new Error(`tar extraction failed: ${extract.stderr.trim()}`);
    }
  } finally {
    fs.removeFile(tarball);
  }

  fs.writeFile(
    path.join(destination, SOURCE_HISTORY_PATH),
    renderSourceHistory(history),
  );

  const readmePath = path.join(destination, "README.md");
  fs.writeFile(
    readmePath,
    insertSnapshotNotice(
      fs.readFile(readmePath),
      renderSnapshotNotice(history),
    ),
  );

  git(runner, destination, ["init", "-b", "main"]);
  // `--force` is load-bearing. Everything in the destination came out of
  // `git archive`, so it is by construction exactly the source's tracked tree —
  // but .gitignore lists `reports/` and `screenshots/`, and those paths are
  // tracked in the source despite it. A fresh repository does not know that, so
  // a plain `git add -A` silently drops the entire reports feature and the
  // screenshot archive. Nothing else can be present: the directory was created
  // moments ago and no install has run in it yet.
  git(runner, destination, ["add", "-A", "--force"]);

  // Checked against the index, before the commit: `git ls-files` reads the
  // index either way, so committing first would only write a commit object
  // nobody wants into a snapshot that is about to be rejected.
  assertExportIsComplete(runner, sourceRoot, destination, history.sourceCommit);

  git(runner, destination, [
    "commit",
    "-m",
    `Gavelhouse snapshot at ${history.sourceCommit.slice(0, 8)}`,
  ]);

  log(`Snapshot built at ${destination}`);
  return destination;
}

/**
 * Verifies the export tracks exactly the source's paths, plus the history file
 * it adds.
 *
 * A snapshot that quietly loses files is the worst failure this script has: it
 * still builds, still installs, and still passes most checks, while the
 * published repository is missing whole features. Comparing the file lists
 * turns that into a loud failure at build time.
 *
 * This compares the manifest, not the bytes — a path present but corrupted
 * still passes. Two source-side features would make the comparison wrong
 * rather than strict, and neither is in use here: `export-ignore` in
 * .gitattributes, which `git archive` honors and `ls-tree` does not, and
 * submodules, which `ls-tree` lists but `git archive` never materializes.
 * Either one would report permanently missing paths, so adding one to this
 * repository means teaching this function about it first.
 */
export function assertExportIsComplete(
  runner: CommandRunner,
  sourceRoot: string,
  destination: string,
  sourceCommit: string,
): void {
  // NUL-separated on both sides. Line-separated output would be quoted and
  // escaped for anything outside ASCII, and the two lists are produced by two
  // different repositories — a quoting difference between them would read here
  // as a file that is both missing and unexpected.
  const toSet = (output: string): Set<string> =>
    new Set(output.split("\0").filter((entry) => entry !== ""));

  const expected = toSet(
    git(runner, sourceRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      "-z",
      sourceCommit,
    ]),
  );
  const actual = toSet(git(runner, destination, ["ls-files", "-z"]));

  const missing = [...expected].filter((file) => !actual.has(file));
  const unexpected = [...actual].filter(
    (file) => !expected.has(file) && file !== SOURCE_HISTORY_PATH,
  );

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      [
        "Snapshot does not match the source tree.",
        missing.length > 0
          ? `Missing ${String(missing.length)}: ${missing.slice(0, 10).join(", ")}`
          : "",
        unexpected.length > 0
          ? `Unexpected ${String(unexpected.length)}: ${unexpected.slice(0, 10).join(", ")}`
          : "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  }
}

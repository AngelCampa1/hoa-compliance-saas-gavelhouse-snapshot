import type { CommandRunner } from "./bootstrap.js";

/**
 * Finds files that git tracks and .gitignore also matches.
 *
 * That combination is legal and silent: git keeps honoring the index, so the
 * files stay tracked and nothing complains. It only surfaces somewhere else —
 * a fresh `git add` in a new clone skips them, and tooling that rebuilds a
 * tree from scratch quietly loses whole directories. The snapshot export lost
 * 26 files that way, which is what this check exists to prevent at the source.
 *
 * An unanchored rule is the usual cause: `reports/` reads as "any directory
 * named reports, at any depth", so it swallows `apps/api/src/routes/reports/`
 * along with the generated output it was written for.
 */

function splitNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry !== "");
}

/** Returns every tracked path that .gitignore also matches, in git's order. */
export function findTrackedIgnoredFiles(
  runner: CommandRunner,
  root: string,
): string[] {
  const listed = runner("git", ["ls-files", "-z"], { cwd: root });
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${listed.stderr.trim()}`);
  }
  if (splitNul(listed.stdout).length === 0) {
    // A repository with nothing tracked has nothing to ask git about.
    return [];
  }

  // Paths travel over stdin, NUL-separated, so a filename holding a space or
  // a quote cannot be misread and the list cannot overflow a command line.
  // `--no-index` is the whole point: without it git reports every tracked path
  // as un-ignored, which is precisely the blind spot being tested.
  const checked = runner(
    "git",
    ["check-ignore", "--no-index", "--stdin", "-z"],
    {
      cwd: root,
      input: listed.stdout,
    },
  );
  // 1 means nothing matched, which is the healthy answer rather than a failure.
  if (checked.status !== 0 && checked.status !== 1) {
    throw new Error(
      `git check-ignore failed in ${root}: ${checked.stderr.trim()}`,
    );
  }

  return splitNul(checked.stdout);
}

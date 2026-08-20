import { verifyLiveCommit, urlForProject } from "./lib/deploy-verify";
import type { VerifyProject } from "./lib/deploy-verify";

export type ParsedArgs = {
  project: VerifyProject;
  commit: string;
  timeoutMs: number;
};

const COMMIT_REGEX = /^[0-9a-f]{7,40}$/i;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let project: VerifyProject | undefined;
  let commit: string | undefined;
  let timeoutMs = 60_000;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --project.");
      if (next !== "api" && next !== "app" && next !== "web") {
        throw new Error(
          `Invalid --project value "${next}". Expected api | app | web.`,
        );
      }
      project = next;
      i += 1;
      continue;
    }
    if (arg === "--commit") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --commit.");
      if (!COMMIT_REGEX.test(next)) {
        throw new Error(
          `Invalid --commit value "${next}". Expected a git SHA of 7-40 hex chars.`,
        );
      }
      commit = next;
      i += 1;
      continue;
    }
    if (arg === "--timeout") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --timeout.");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --timeout value "${next}".`);
      }
      timeoutMs = parsed;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!project) throw new Error("Missing required --project argument.");
  if (!commit) throw new Error("Missing required --commit argument.");
  return { project, commit, timeoutMs };
}

async function main(): Promise<void> {
  const { project, commit, timeoutMs } = parseArgs(process.argv.slice(2));
  const url = urlForProject(project);
  console.log(`Verifying ${url} serves commit ${commit}…`);
  const result = await verifyLiveCommit({
    project,
    expectedCommit: commit,
    timeoutMs,
  });
  if (result.ok) {
    console.log(
      `Live commit ${result.servedCommit} matches expected ${commit}.`,
    );
    return;
  }
  console.error(
    `Deploy verification failed after ${result.attempts} attempts. ` +
      `Served commit: ${result.servedCommit ?? "(none)"}. Expected: ${commit}.`,
  );
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /deploy-verify(\.ts|\.js)?$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

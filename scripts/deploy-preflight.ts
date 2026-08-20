import { runPreflight } from "./lib/deploy-preflight";
import type { PreflightProject } from "./lib/deploy-preflight";

type ParsedArgs = {
  project: PreflightProject;
  allowDirty: boolean;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  let project: PreflightProject | undefined;
  let allowDirty = false;

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
    if (arg === "--allow-dirty") {
      allowDirty = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!project) {
    throw new Error("Missing required --project <api|app|web> argument.");
  }
  return { project, allowDirty };
}

async function main(): Promise<void> {
  const { project, allowDirty } = parseArgs(process.argv.slice(2));
  const result = await runPreflight({ project, allowDirty });
  if (!result.ok) {
    console.error("Preflight failed:");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  // Canonical single-line output downstream scripts parse for the SHA.
  console.log(result.commitSha);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

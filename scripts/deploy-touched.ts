import {
  createDeployPlan,
  getAllProjects,
  getTouchedFiles,
  parseDeployTouchedArgs,
  runDeployCommand,
} from "./lib/deploy-touched";

function main() {
  const { all, dryRun, fromRef } = parseDeployTouchedArgs(
    process.argv.slice(2),
  );
  const projects = all
    ? getAllProjects()
    : createDeployPlan(getTouchedFiles(fromRef)).projects;

  if (projects.length === 0) {
    console.log(`No deployable project changes found since ${fromRef}.`);
    return;
  }

  console.log(`Deploying touched Cloudflare projects: ${projects.join(",")}`);

  for (const project of projects) {
    if (dryRun) {
      console.log(`[dry-run] pnpm run deploy:${project}`);
      continue;
    }

    runDeployCommand(project);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

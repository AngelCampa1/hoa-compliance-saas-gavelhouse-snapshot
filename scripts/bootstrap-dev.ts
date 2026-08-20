import { runBootstrap } from "./lib/bootstrap";

runBootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

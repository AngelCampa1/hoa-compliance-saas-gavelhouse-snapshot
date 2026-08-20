import { execFileSync, execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { main, discoverPackages } from "./lib/affected-packages";

main({
  getStagedFiles: () => {
    const output = execSync("git diff --cached --name-only --diff-filter=d", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  },
  discoverPackages: (rootDir) =>
    discoverPackages(rootDir, {
      readdirSync: readdirSync as (path: string) => string[],
      readFileSync: readFileSync as (path: string, encoding: string) => string,
    }),
  exec: ({ command, args }) => {
    console.log(`\n> ${[command, ...args].join(" ")}\n`);
    execFileSync(command, args, { stdio: "inherit" });
  },
  log: (message) => console.log(message),
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
});

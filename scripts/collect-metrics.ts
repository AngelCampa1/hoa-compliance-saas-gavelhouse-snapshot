/**
 * Regenerates portfolio/METRICS.md and the metrics block in README.md.
 *
 *   pnpm run metrics:generate   write both files
 *   pnpm run metrics:check      fail if either is out of date
 *
 * The check mode runs in the `verify` chain so a stale number in the README
 * breaks the build rather than quietly misleading a reader.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import {
  collectMetrics,
  renderMetricsDoc,
  renderReadmeBlock,
  replaceReadmeBlock,
  type MetricsDeps,
} from "./lib/metrics.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readmePath = path.join(repoRoot, "README.md");
const metricsDocPath = path.join(repoRoot, "portfolio", "METRICS.md");

/**
 * Count unique HTTP endpoints by reading Hono's own route table. Middleware
 * registered with `app.use` appears as method `ALL` and is excluded.
 */
async function countEndpoints(): Promise<number> {
  const entry = path.join(repoRoot, "apps", "api", "src", "index.ts");
  const module = (await import(
    /* @vite-ignore */ `file://${entry.split(path.sep).join("/")}`
  )) as { app: { routes: ReadonlyArray<{ method: string; path: string }> } };

  const unique = new Set(
    module.app.routes
      .filter((route) => route.method !== "ALL")
      .map((route) => `${route.method} ${route.path}`),
  );
  return unique.size;
}

const deps: MetricsDeps = {
  run: (command, args) =>
    execFileSync(command, [...args], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  readFile: (relativePath) => {
    try {
      return readFileSync(path.join(repoRoot, relativePath), "utf8");
    } catch {
      return null;
    }
  },
  countEndpoints,
};

/**
 * Run the rendered markdown through Prettier before writing or comparing.
 *
 * Prettier pads markdown pipe columns to align, so a raw render and a formatted
 * render of the same metrics differ byte-for-byte. Any `prettier --write` over
 * these files would then leave `--check` reporting them as stale forever.
 * Formatting here means the generator's output is already the fixed point.
 *
 * Line endings matter too: Prettier emits LF, and `--check` compares bytes. See
 * the `.gitattributes` entries pinning these files to `eol=lf`.
 */
async function formatMarkdown(
  source: string,
  filePath: string,
): Promise<string> {
  const options = await resolveConfig(filePath);
  return format(source, { ...options, filepath: filePath });
}

function readOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const metrics = await collectMetrics(deps);

  const nextDoc = await formatMarkdown(
    renderMetricsDoc(metrics),
    metricsDocPath,
  );
  const readme = readOrEmpty(readmePath);
  const nextReadme = await formatMarkdown(
    replaceReadmeBlock(readme, renderReadmeBlock(metrics)),
    readmePath,
  );

  if (check) {
    const stale: string[] = [];
    if (readOrEmpty(metricsDocPath) !== nextDoc) stale.push("portfolio/METRICS.md");
    if (readme !== nextReadme) stale.push("README.md");

    if (stale.length > 0) {
      console.error(
        `Metrics are out of date in: ${stale.join(", ")}\n` +
          "Run `pnpm run metrics:generate` and commit the result.",
      );
      process.exit(1);
    }
    console.log("Metrics are up to date.");
    return;
  }

  writeFileSync(metricsDocPath, nextDoc, "utf8");
  writeFileSync(readmePath, nextReadme, "utf8");
  console.log(
    `Wrote portfolio/METRICS.md and updated README.md ` +
      `(${metrics.loc.lines.toLocaleString("en-US")} lines, ` +
      `${metrics.api.endpoints} endpoints, ${metrics.schema.tables} tables).`,
  );
}

await main();

#!/usr/bin/env node
// Deploy orchestrator — runs preflight, injects BUILD_COMMIT into the build
// environment, builds, uploads to Cloudflare, then self-verifies the live URL.
// Never bypass this wrapper by calling `wrangler` directly; the
// scripts/check-no-raw-wrangler.ts guard enforces that at verify time.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECTS = new Set(["api", "app", "web"]);

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(1);
}

const project = process.argv[2];
if (!project || !PROJECTS.has(project)) {
  fail(
    `Usage: run-deploy-sequence.mjs <api|app|web>. Got "${project ?? "(none)"}".`,
  );
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function run(step, command, args, options = {}) {
  console.log(`\n[deploy:${project}] ${step}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    options.onFailure?.();
    fail(`step "${step}" failed with exit code ${result.status ?? "null"}.`);
  }
  return result;
}

function capture(step, command, args, options = {}) {
  console.log(`\n[deploy:${project}] ${step}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    fail(`step "${step}" failed with exit code ${result.status ?? "null"}.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  return result.stdout ?? "";
}

function writeApiDeployConfig(apiCwd, commitSha) {
  const sourcePath = path.join(apiCwd, "wrangler.toml");
  const deployPath = path.join(apiCwd, ".wrangler.deploy.toml");
  const source = fs.readFileSync(sourcePath, "utf8");
  const buildCommitLine = `BUILD_COMMIT = "${commitSha}"`;

  let next = source.replace(/^BUILD_COMMIT\s*=.*$/m, buildCommitLine);
  if (next === source) {
    next = source.replace(/(\[vars\]\r?\n)/, `$1${buildCommitLine}\n`);
  }

  if (next === source) {
    fail("unable to inject BUILD_COMMIT into API Wrangler deploy config.");
  }

  fs.writeFileSync(deployPath, next);
  return deployPath;
}

function isWebShutdown(webCwd) {
  const wrangler = fs.readFileSync(path.join(webCwd, "wrangler.toml"), "utf8");
  return /^\s*GAVELHOUSE_SHUTDOWN\s*=\s*"true"\s*$/m.test(wrangler);
}

const allowDirty = process.env["DEPLOY_ALLOW_DIRTY"] === "1";
const preflightArgs = [
  "tsx",
  "scripts/deploy-preflight.ts",
  "--project",
  project,
];
if (allowDirty) preflightArgs.push("--allow-dirty");
const preflightStdout = capture("preflight", "npx", preflightArgs);
const commitSha = preflightStdout.trim().split(/\r?\n/).pop()?.trim() ?? "";
if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
  fail(`preflight did not emit a valid commit SHA (got "${commitSha}").`);
}

const deployEnv = {
  ...process.env,
  BUILD_COMMIT: commitSha,
  PUBLIC_BUILD_COMMIT: commitSha,
  VITE_BUILD_COMMIT: commitSha,
};

if (project === "web") {
  deployEnv.PUBLIC_POSTHOG_KEY ??= "REPLACE_WITH_POSTHOG_PROJECT_KEY";
  deployEnv.PUBLIC_POSTHOG_HOST ??= "https://us.i.posthog.com";

  const webCwd = path.join(repoRoot, "apps", "web");
  run("audit:seo", "pnpm", ["run", "audit:seo"], {
    cwd: webCwd,
    env: deployEnv,
  });
  run("generate:pdfs", "pnpm", ["run", "generate:pdfs"], {
    cwd: webCwd,
    env: deployEnv,
  });
  run(
    "verify-lead-magnet-pdfs",
    "npx",
    ["tsx", "scripts/verify-lead-magnet-pdfs.ts"],
    { cwd: webCwd, env: deployEnv },
  );
  run("astro build", "npx", ["astro", "build"], {
    cwd: webCwd,
    env: deployEnv,
  });
  run(
    "verify-lead-magnet-pdfs --dist-absent",
    "npx",
    ["tsx", "scripts/verify-lead-magnet-pdfs.ts", "--dist-absent"],
    { cwd: webCwd, env: deployEnv },
  );
  if (isWebShutdown(webCwd)) {
    console.log(
      "\n[deploy:web] skipping lead magnet R2 upload because Gavelhouse is shut down.",
    );
  } else {
    run(
      "upload-lead-magnet-pdfs-to-r2",
      "npx",
      ["tsx", "scripts/upload-lead-magnet-pdfs-to-r2.ts"],
      { cwd: webCwd, env: deployEnv },
    );
    run(
      "verify-lead-magnet-r2",
      "npx",
      ["tsx", "scripts/verify-lead-magnet-r2.ts"],
      { cwd: webCwd, env: deployEnv },
    );
  }
  run(
    "deploy:upload",
    "npx",
    ["wrangler", "deploy", "--var", `BUILD_COMMIT:${commitSha}`],
    {
      cwd: webCwd,
      env: deployEnv,
    },
  );
} else if (project === "app") {
  deployEnv.VITE_POSTHOG_KEY ??= "REPLACE_WITH_POSTHOG_PROJECT_KEY";
  deployEnv.VITE_POSTHOG_HOST ??= "https://us.i.posthog.com";
  // Vite inlines VITE_* at build time from process.env, not from wrangler.toml
  // runtime vars. Without this the bundle would boot the real dashboard even
  // though the Worker's [vars] block says the product is shut down.
  deployEnv.VITE_GAVELHOUSE_SHUTDOWN = "true";

  const appCwd = path.join(repoRoot, "apps", "app");
  run(
    "assert-build-env",
    "pnpm",
    ["exec", "tsx", "./scripts/assert-build-env.ts", "--strict"],
    { cwd: appCwd, env: deployEnv },
  );
  run("vite build", "npx", ["vite", "build"], {
    cwd: appCwd,
    env: deployEnv,
  });
  run(
    "deploy:upload",
    "npx",
    ["wrangler", "deploy", "--var", `BUILD_COMMIT:${commitSha}`],
    {
      cwd: appCwd,
      env: deployEnv,
    },
  );
} else {
  const apiCwd = path.join(repoRoot, "apps", "api");
  const deployConfigPath = writeApiDeployConfig(apiCwd, commitSha);
  run(
    "deploy:upload",
    "npx",
    [
      "wrangler",
      "deploy",
      "--config",
      deployConfigPath,
      "--var",
      `BUILD_COMMIT:${commitSha}`,
      "--define",
      `globalThis.__BUILD_COMMIT__:'${commitSha}'`,
    ],
    {
      cwd: apiCwd,
      env: deployEnv,
      onFailure: () => fs.rmSync(deployConfigPath, { force: true }),
    },
  );
  fs.rmSync(deployConfigPath, { force: true });
}

run("verify", "npx", [
  "tsx",
  "scripts/deploy-verify.ts",
  "--project",
  project,
  "--commit",
  commitSha,
]);

console.log(
  `\n[deploy:${project}] success — live commit verified as ${commitSha}.`,
);

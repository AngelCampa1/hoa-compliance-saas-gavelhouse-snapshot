import { spawnSync } from "node:child_process";

/**
 * Result of running a shell command. Mirrors the subset of Node's
 * `spawnSync` return shape that bootstrap logic needs, and never throws on a
 * non-zero exit code (unlike `execFileSync`) so retryable steps such as
 * polling for Postgres readiness can inspect the exit status directly.
 */
export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type CommandRunnerOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Written to the command's stdin. Some git plumbing reads its input only
   * this way — `check-ignore --stdin -z` refuses NUL-separated paths as
   * arguments — and a long path list would overflow a command line anyway.
   */
  input?: string;
};

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandRunnerOptions,
) => CommandResult;

export type ComposeCommand = {
  command: string;
  args: readonly string[];
};

/**
 * Runs a command the way every script in this directory expects, including the
 * Windows shell shim. Exported so the shim itself is testable — callers that
 * must bypass it (`git archive` writing binary, where joining argv on spaces
 * would corrupt a quoted commit message) build their own runner instead.
 */
export const defaultRunner: CommandRunner = (command, args, options) => {
  if (process.platform === "win32") {
    // On Windows, `docker`, `pnpm`, and `docker-compose` may be `.cmd`/`.ps1`
    // shims that require shell resolution — same approach as
    // scripts/lib/deploy-preflight.ts and scripts/lib/deploy-touched.ts.
    const result = spawnSync(
      process.env["ComSpec"] ?? "cmd.exe",
      ["/d", "/s", "/c", [command, ...args].join(" ")],
      {
        cwd: options?.cwd,
        env: options?.env,
        input: options?.input,
        encoding: "utf-8",
      },
    );
    return toCommandResult(result);
  }

  const result = spawnSync(command, args as string[], {
    cwd: options?.cwd,
    env: options?.env,
    input: options?.input,
    encoding: "utf-8",
  });
  return toCommandResult(result);
};

function toCommandResult(result: {
  status: number | null;
  stdout: string | null;
  stderr: string | null;
  error?: Error;
}): CommandResult {
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr:
      (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : ""),
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const POSTGRES_SERVICE = "postgres";
export const POSTGRES_USER = "postgres";
export const POSTGRES_DB = "boardstack_dev";
export const POSTGRES_HOST_PORT = 55460;
export const DEV_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${POSTGRES_HOST_PORT}/boardstack_dev`;

const DEFAULT_MAX_READY_ATTEMPTS = 30;
const DEFAULT_READY_POLL_INTERVAL_MS = 2000;

export type BootstrapOptions = {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  maxReadyAttempts?: number;
  readyPollIntervalMs?: number;
};

/**
 * Detects whether Docker Compose is available as the v2 `docker compose`
 * subcommand or the legacy v1 `docker-compose` binary. Docker is a hard
 * prerequisite for local development, so this throws a clear, actionable
 * error when neither is present.
 */
export function detectComposeCommand(runner: CommandRunner): ComposeCommand {
  const v2 = runner("docker", ["compose", "version"]);
  if (v2.status === 0) {
    return { command: "docker", args: ["compose"] };
  }

  const v1 = runner("docker-compose", ["version"]);
  if (v1.status === 0) {
    return { command: "docker-compose", args: [] };
  }

  throw new Error(
    "Docker is required for local development, but neither `docker compose` (v2) " +
      "nor `docker-compose` (v1) is available on PATH.\n" +
      "Install Docker Desktop from https://www.docker.com/products/docker-desktop/, " +
      "make sure it is running, then re-run `pnpm run dev:bootstrap`.",
  );
}

/**
 * Starts the local Postgres service in detached mode via docker compose.
 */
export function startPostgres(
  runner: CommandRunner,
  compose: ComposeCommand,
  repoRoot: string,
  log: (message: string) => void,
): void {
  log("Starting local Postgres (docker compose up -d postgres)...");
  const result = runner(
    compose.command,
    [...compose.args, "up", "-d", POSTGRES_SERVICE],
    { cwd: repoRoot },
  );
  if (result.status !== 0) {
    throw new Error(
      "Failed to start the local Postgres container. Make sure Docker Desktop " +
        `is running, then re-run \`pnpm run dev:bootstrap\`.\n${(result.stderr || result.stdout || "No output captured.").trim()}`,
    );
  }
}

export type WaitForPostgresOptions = {
  maxAttempts: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
};

/**
 * Polls Postgres via `pg_isready` (run inside the container through
 * `docker compose exec`) until it accepts connections, or fails with a
 * clear message after a bounded number of attempts.
 */
export async function waitForPostgresReady(
  runner: CommandRunner,
  compose: ComposeCommand,
  repoRoot: string,
  options: WaitForPostgresOptions,
): Promise<void> {
  const { maxAttempts, intervalMs, sleep, log } = options;
  log("Waiting for Postgres to accept connections...");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runner(
      compose.command,
      [
        ...compose.args,
        "exec",
        "-T",
        POSTGRES_SERVICE,
        "pg_isready",
        "-U",
        POSTGRES_USER,
        "-d",
        POSTGRES_DB,
      ],
      { cwd: repoRoot },
    );

    if (result.status === 0) {
      log(`Postgres is ready (attempt ${attempt}/${maxAttempts}).`);
      return;
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  const timeoutSeconds = Math.round((maxAttempts * intervalMs) / 1000);
  throw new Error(
    `Postgres did not become ready after ${maxAttempts} attempts (~${timeoutSeconds}s). ` +
      "Check that Docker Desktop is running and inspect the container logs with " +
      `\`${[compose.command, ...compose.args].join(" ")} logs ${POSTGRES_SERVICE}\`.`,
  );
}

/**
 * Runs Drizzle migrations against the local Postgres container.
 * `apps/api/drizzle.config.ts` reads `DATABASE_URL` from the child process
 * environment, so it is injected here rather than relying on a shell export.
 */
export function runMigrations(
  runner: CommandRunner,
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  log: (message: string) => void,
): void {
  log(
    "Running database migrations (pnpm --filter @boardstack/api run db:migrate)...",
  );

  const migrateEnv: NodeJS.ProcessEnv = {
    ...env,
    DATABASE_URL: DEV_DATABASE_URL,
  };
  const result = runner(
    "pnpm",
    ["--filter", "@boardstack/api", "run", "db:migrate"],
    { cwd: repoRoot, env: migrateEnv },
  );

  if (result.stdout.trim().length > 0) {
    log(result.stdout.trim());
  }
  if (result.stderr.trim().length > 0) {
    log(result.stderr.trim());
  }

  if (result.status !== 0) {
    throw new Error(
      `Database migration failed (exit code ${result.status ?? "unknown"}). See output above for details.`,
    );
  }
}

/**
 * Full local dev bootstrap: detect Docker Compose, start Postgres, wait for
 * it to accept connections, then apply Drizzle migrations. Does not start
 * any app servers or seed data — see printed next steps for those.
 */
export async function runBootstrap(
  options: BootstrapOptions = {},
): Promise<void> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const env = options.env ?? process.env;
  const runner = options.runner ?? defaultRunner;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? ((message: string) => console.log(message));
  const maxReadyAttempts =
    options.maxReadyAttempts ?? DEFAULT_MAX_READY_ATTEMPTS;
  const readyPollIntervalMs =
    options.readyPollIntervalMs ?? DEFAULT_READY_POLL_INTERVAL_MS;

  const compose = detectComposeCommand(runner);
  log(
    `Using \`${[compose.command, ...compose.args].join(" ")}\` to manage local Postgres.`,
  );

  startPostgres(runner, compose, repoRoot, log);
  await waitForPostgresReady(runner, compose, repoRoot, {
    maxAttempts: maxReadyAttempts,
    intervalMs: readyPollIntervalMs,
    sleep,
    log,
  });
  runMigrations(runner, repoRoot, env, log);

  log("");
  log("Local Postgres is running and migrations are applied.");
  log("Next steps:");
  log("  1. In one terminal, run: pnpm dev");
  log(
    "  2. In another terminal, run: pnpm --filter @boardstack/api run seed:demo",
  );
  log("  3. Open http://localhost:3060");
}

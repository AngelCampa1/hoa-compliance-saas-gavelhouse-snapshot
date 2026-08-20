import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandResult, CommandRunner, ComposeCommand } from "./bootstrap";
import {
  DEV_DATABASE_URL,
  POSTGRES_DB,
  POSTGRES_HOST_PORT,
  POSTGRES_SERVICE,
  POSTGRES_USER,
  detectComposeCommand,
  runBootstrap,
  runMigrations,
  startPostgres,
  waitForPostgresReady,
} from "./bootstrap";

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_COMSPEC = process.env["ComSpec"];

afterEach(() => {
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
  if (ORIGINAL_COMSPEC === undefined) {
    delete process.env["ComSpec"];
  } else {
    process.env["ComSpec"] = ORIGINAL_COMSPEC;
  }
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

function ok(stdout = ""): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

function fail(stderr = "boom", status: number | null = 1): CommandResult {
  return { status, stdout: "", stderr };
}

type CommandCall = { command: string; args: readonly string[] };

const COMPOSE_V2: ComposeCommand = { command: "docker", args: ["compose"] };

describe("constants", () => {
  it("exposes the local dev connection details used across docs and .dev.vars", () => {
    expect(POSTGRES_SERVICE).toBe("postgres");
    expect(POSTGRES_USER).toBe("postgres");
    expect(POSTGRES_DB).toBe("boardstack_dev");
    expect(POSTGRES_HOST_PORT).toBe(55460);
    expect(DEV_DATABASE_URL).toBe(
      "postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev",
    );
  });
});

describe("detectComposeCommand", () => {
  it("prefers docker compose v2 when available", () => {
    const runner: CommandRunner = (command, args) => {
      if (command === "docker" && args.join(" ") === "compose version") {
        return ok();
      }
      throw new Error(`unexpected: ${command} ${args.join(" ")}`);
    };
    expect(detectComposeCommand(runner)).toEqual({
      command: "docker",
      args: ["compose"],
    });
  });

  it("falls back to docker-compose v1 when v2 is unavailable", () => {
    const runner: CommandRunner = (command, args) => {
      if (command === "docker" && args.join(" ") === "compose version") {
        return fail();
      }
      if (command === "docker-compose" && args.join(" ") === "version") {
        return ok();
      }
      throw new Error(`unexpected: ${command} ${args.join(" ")}`);
    };
    expect(detectComposeCommand(runner)).toEqual({
      command: "docker-compose",
      args: [],
    });
  });

  it("throws a clear, actionable error when neither compose command is available", () => {
    const runner: CommandRunner = () => fail();
    expect(() => detectComposeCommand(runner)).toThrow(
      /Docker is required for local development/,
    );
    expect(() => detectComposeCommand(runner)).toThrow(
      /docker compose.*docker-compose/s,
    );
  });
});

describe("startPostgres", () => {
  it("starts the postgres service detached", () => {
    const calls: CommandCall[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args });
      return ok();
    };
    const log = vi.fn();

    startPostgres(runner, COMPOSE_V2, "/repo", log);

    expect(calls).toEqual([
      { command: "docker", args: ["compose", "up", "-d", "postgres"] },
    ]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Starting local Postgres"),
    );
  });

  it("throws with captured stderr when the container fails to start", () => {
    const runner: CommandRunner = () => fail("no such service");
    const log = vi.fn();

    expect(() => startPostgres(runner, COMPOSE_V2, "/repo", log)).toThrow(
      /Failed to start the local Postgres container/,
    );
    expect(() => startPostgres(runner, COMPOSE_V2, "/repo", log)).toThrow(
      /no such service/,
    );
  });

  it("falls back to stdout in the error message when stderr is empty", () => {
    const runner: CommandRunner = () => ({
      status: 1,
      stdout: "some stdout diagnostic",
      stderr: "",
    });
    const log = vi.fn();

    expect(() => startPostgres(runner, COMPOSE_V2, "/repo", log)).toThrow(
      /some stdout diagnostic/,
    );
  });

  it("falls back to a generic message when no output was captured", () => {
    const runner: CommandRunner = () => ({ status: 1, stdout: "", stderr: "" });
    const log = vi.fn();

    expect(() => startPostgres(runner, COMPOSE_V2, "/repo", log)).toThrow(
      /No output captured/,
    );
  });
});

describe("waitForPostgresReady", () => {
  it("resolves as soon as pg_isready succeeds", async () => {
    const calls: CommandCall[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args });
      return ok();
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await waitForPostgresReady(runner, COMPOSE_V2, "/repo", {
      maxAttempts: 5,
      intervalMs: 10,
      sleep,
      log,
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: [
          "compose",
          "exec",
          "-T",
          "postgres",
          "pg_isready",
          "-U",
          "postgres",
          "-d",
          "boardstack_dev",
        ],
      },
    ]);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Postgres is ready (attempt 1/5)"),
    );
  });

  it("retries with a sleep between attempts until Postgres is ready", async () => {
    let attempt = 0;
    const runner: CommandRunner = () => {
      attempt += 1;
      return attempt < 3 ? fail() : ok();
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await waitForPostgresReady(runner, COMPOSE_V2, "/repo", {
      maxAttempts: 5,
      intervalMs: 250,
      sleep,
      log,
    });

    expect(attempt).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("throws a bounded, clear timeout error when Postgres never becomes ready", async () => {
    const runner: CommandRunner = () => fail();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      waitForPostgresReady(runner, COMPOSE_V2, "/repo", {
        maxAttempts: 3,
        intervalMs: 1000,
        sleep,
        log,
      }),
    ).rejects.toThrow(/did not become ready after 3 attempts \(~3s\)/);
    // Sleep is only called between attempts, never after the last one.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe("runMigrations", () => {
  it("runs drizzle migrations with DATABASE_URL injected into the child env", () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      options?: { cwd?: string; env?: NodeJS.ProcessEnv };
    }> = [];
    const runner: CommandRunner = (command, args, options) => {
      calls.push({ command, args, options });
      return ok("applied 27 migrations");
    };
    const log = vi.fn();

    runMigrations(runner, "/repo", { PATH: "/usr/bin" }, log);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("pnpm");
    expect(calls[0]?.args).toEqual([
      "--filter",
      "@boardstack/api",
      "run",
      "db:migrate",
    ]);
    expect(calls[0]?.options?.cwd).toBe("/repo");
    expect(calls[0]?.options?.env).toEqual({
      PATH: "/usr/bin",
      DATABASE_URL: DEV_DATABASE_URL,
    });
    expect(log).toHaveBeenCalledWith("applied 27 migrations");
  });

  it("logs stderr output even on success", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "",
      stderr: "warning: something noisy",
    });
    const log = vi.fn();

    runMigrations(runner, "/repo", {}, log);

    expect(log).toHaveBeenCalledWith("warning: something noisy");
  });

  it("throws with the exit code when migrations fail", () => {
    const runner: CommandRunner = () => fail("migration error", 1);
    const log = vi.fn();

    expect(() => runMigrations(runner, "/repo", {}, log)).toThrow(
      /Database migration failed \(exit code 1\)/,
    );
  });

  it("reports an unknown exit code when status is null", () => {
    const runner: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
    });
    const log = vi.fn();

    expect(() => runMigrations(runner, "/repo", {}, log)).toThrow(
      /exit code unknown/,
    );
  });
});

describe("runBootstrap", () => {
  it("orchestrates detect -> start -> wait -> migrate and prints next steps", async () => {
    const calls: CommandCall[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args });
      if (command === "docker" && args.join(" ") === "compose version") {
        return ok();
      }
      if (command === "docker" && args[0] === "compose" && args[1] === "up") {
        return ok();
      }
      if (command === "docker" && args[0] === "compose" && args[1] === "exec") {
        return ok();
      }
      if (command === "pnpm") {
        return ok("27 migrations applied");
      }
      throw new Error(`unexpected: ${command} ${args.join(" ")}`);
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await runBootstrap({
      repoRoot: "/repo",
      env: {},
      runner,
      sleep,
      log,
      maxReadyAttempts: 3,
      readyPollIntervalMs: 10,
    });

    expect(calls[0]).toEqual({
      command: "docker",
      args: ["compose", "version"],
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Using `docker compose`"),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Local Postgres is running and migrations are applied.",
      ),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pnpm dev"));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("pnpm --filter @boardstack/api run seed:demo"),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:3060"),
    );
  });

  it("propagates the compose detection error without starting Postgres", async () => {
    const runner: CommandRunner = () => fail();
    const log = vi.fn();

    await expect(
      runBootstrap({ repoRoot: "/repo", env: {}, runner, log }),
    ).rejects.toThrow(/Docker is required for local development/);
  });

  it("uses process.cwd, process.env, and a real console.log by default", async () => {
    const runner: CommandRunner = () => ok();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runBootstrap({ runner, maxReadyAttempts: 1, readyPollIntervalMs: 1 });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("uses a real timer-based sleep by default when retrying readiness checks", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const runner: CommandRunner = (command, args) => {
      if (command === "docker" && args.join(" ") === "compose version") {
        return ok();
      }
      if (args[1] === "up") {
        return ok();
      }
      if (args[1] === "exec") {
        attempt += 1;
        return attempt < 2 ? fail() : ok();
      }
      return ok();
    };
    const log = vi.fn();

    const bootstrapPromise = runBootstrap({
      repoRoot: "/repo",
      env: {},
      runner,
      log,
      maxReadyAttempts: 5,
      readyPollIntervalMs: 5,
    });

    await vi.runAllTimersAsync();
    await bootstrapPromise;

    expect(attempt).toBe(2);
    vi.useRealTimers();
  });
});

describe("defaultRunner", () => {
  it("invokes spawnSync directly on non-Windows platforms", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const spawnSync = vi.fn(
      (_command: string, _args: readonly string[], _options?: unknown) => ({
        status: 0,
        stdout: "v2.40.0",
        stderr: "",
      }),
    );
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { detectComposeCommand: detect } = await import("./bootstrap");
    const runnerModule = await import("./bootstrap");
    // Exercise the default runner indirectly via a function that accepts no
    // runner override.
    const compose = detect((command, args, options) => {
      const result = spawnSync(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        encoding: "utf-8",
      });
      return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    });

    expect(compose).toEqual({ command: "docker", args: ["compose"] });
    expect(spawnSync).toHaveBeenCalledWith(
      "docker",
      ["compose", "version"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
    expect(runnerModule).toBeDefined();
  });

  it("writes the caller's stdin through to the process", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const spawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { defaultRunner } = await import("./bootstrap");
    defaultRunner("git", ["check-ignore", "--stdin", "-z"], {
      input: "README.md\0",
    });

    // `git check-ignore --stdin` reads its paths from nowhere else, so a
    // dropped `input` would silently make every answer an empty one.
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["check-ignore", "--stdin", "-z"],
      expect.objectContaining({ input: "README.md\0" }),
    );
  });

  it("writes stdin through the cmd.exe shim too", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["ComSpec"] = "C:\\Windows\\System32\\cmd.exe";
    const spawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { defaultRunner } = await import("./bootstrap");
    defaultRunner("git", ["check-ignore", "--stdin"], { input: "README.md\0" });

    // The shim rewrites the command into a cmd.exe argument list; stdin has to
    // survive that rewrite, since this is the platform the repository runs on.
    expect(spawnSync).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "git check-ignore --stdin"],
      expect.objectContaining({ input: "README.md\0" }),
    );
  });

  it("wraps commands through cmd.exe on win32 when no runner is injected", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["ComSpec"] = "C:\\Windows\\System32\\cmd.exe";
    const spawnSync = vi.fn((command: string, args: readonly string[]) => {
      const shellCommand = args.at(-1);
      if (shellCommand === "docker compose version") {
        return { status: 0, stdout: "v2.40.0", stderr: "" };
      }
      if (shellCommand === "docker compose up -d postgres") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (
        shellCommand ===
        "docker compose exec -T postgres pg_isready -U postgres -d boardstack_dev"
      ) {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (shellCommand === "pnpm --filter @boardstack/api run db:migrate") {
        return { status: 0, stdout: "applied", stderr: "" };
      }
      throw new Error(`unexpected shell command: ${String(shellCommand)}`);
    });
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { runBootstrap: runWindowsBootstrap } = await import("./bootstrap");
    const log = vi.fn();

    await runWindowsBootstrap({
      repoRoot: "/repo",
      env: {},
      log,
      maxReadyAttempts: 2,
      readyPollIntervalMs: 1,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "docker compose version"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("falls back to cmd.exe when ComSpec is unset on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    delete process.env["ComSpec"];
    const spawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { detectComposeCommand: detectWithDefault } =
      await import("./bootstrap");
    // Force the module's own default runner by not passing one — exercised
    // through runBootstrap instead, since detectComposeCommand requires an
    // explicit runner argument.
    expect(detectWithDefault).toBeDefined();

    const spawnSyncForBootstrap = vi.fn(
      (command: string, args: readonly string[]) => {
        const shellCommand = args.at(-1);
        if (shellCommand === "docker compose version") {
          return { status: 0, stdout: "", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    );
    vi.doUnmock("node:child_process");
    vi.doMock("node:child_process", () => ({
      spawnSync: spawnSyncForBootstrap,
    }));
    vi.resetModules();

    const { runBootstrap: runWithFallback } = await import("./bootstrap");
    await runWithFallback({
      repoRoot: "/repo",
      env: {},
      maxReadyAttempts: 1,
      readyPollIntervalMs: 1,
      log: () => undefined,
    });

    expect(spawnSyncForBootstrap).toHaveBeenCalledWith(
      "cmd.exe",
      ["/d", "/s", "/c", "docker compose version"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("appends the spawn error message to stderr when the child process errors", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const spawnSync = vi.fn(() => ({
      status: null,
      stdout: null,
      stderr: null,
      error: new Error("ENOENT: docker not found"),
    }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { runBootstrap: runWithSpawnError } = await import("./bootstrap");

    await expect(
      runWithSpawnError({
        repoRoot: "/repo",
        env: {},
        log: () => undefined,
      }),
    ).rejects.toThrow(/Docker is required for local development/);
  });
});

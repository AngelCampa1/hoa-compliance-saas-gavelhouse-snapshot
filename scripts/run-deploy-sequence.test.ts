import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function writeFakeNpx(binDir: string): void {
  const fakeNpxCmdPath = path.join(binDir, "npx.cmd");
  writeFileSync(
    fakeNpxCmdPath,
    [
      "@echo off",
      'echo %*>> "%RUN_DEPLOY_SEQUENCE_TEST_LOG%"',
      'if "%1"=="tsx" if "%2"=="scripts/deploy-preflight.ts" (',
      "  echo abc1234",
      "  exit /b 0",
      ")",
      "exit /b 0",
      "",
    ].join("\r\n"),
  );

  const fakeNpxPath = path.join(binDir, "npx");
  writeFileSync(
    fakeNpxPath,
    [
      "#!/usr/bin/env sh",
      'printf "%s\\n" "$*" >> "$RUN_DEPLOY_SEQUENCE_TEST_LOG"',
      'if [ "$1" = "tsx" ] && [ "$2" = "scripts/deploy-preflight.ts" ]; then',
      "  printf '%s\\n' abc1234",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(fakeNpxPath, 0o755);
}

function writeFakePnpm(binDir: string): void {
  const fakePnpmCmdPath = path.join(binDir, "pnpm.cmd");
  writeFileSync(
    fakePnpmCmdPath,
    [
      "@echo off",
      'echo pnpm %*>> "%RUN_DEPLOY_SEQUENCE_TEST_LOG%"',
      "exit /b 0",
      "",
    ].join("\r\n"),
  );

  const fakePnpmPath = path.join(binDir, "pnpm");
  writeFileSync(
    fakePnpmPath,
    [
      "#!/usr/bin/env sh",
      'printf "pnpm %s\\n" "$*" >> "$RUN_DEPLOY_SEQUENCE_TEST_LOG"',
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(fakePnpmPath, 0o755);
}

describe("run-deploy-sequence API commit injection", () => {
  it("passes BUILD_COMMIT through Wrangler's runtime var flag", () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "boardstack-deploy-sequence-"),
    );
    const logPath = path.join(tempDir, "commands.log");

    try {
      writeFakeNpx(tempDir);

      const result = spawnSync(
        process.execPath,
        ["scripts/run-deploy-sequence.mjs", "api"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PATH: `${tempDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
            RUN_DEPLOY_SEQUENCE_TEST_LOG: logPath,
          },
          encoding: "utf8",
        },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        "[deploy:api] preflight: npx tsx scripts/deploy-preflight.ts --project api",
      );

      const commands = readFileSync(logPath, "utf8");
      const deployCommand = commands
        .split(/\r?\n/)
        .find((line) => line.includes("wrangler deploy"));

      expect(deployCommand).toContain("--var BUILD_COMMIT:abc1234");
      expect(deployCommand).toContain(
        "--define globalThis.__BUILD_COMMIT__:'abc1234'",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("deploys app and web frontends as Workers", () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "boardstack-deploy-sequence-"),
    );
    try {
      for (const project of ["app", "web"]) {
        const logPath = path.join(tempDir, `${project}.log`);
        writeFakeNpx(tempDir);
        writeFakePnpm(tempDir);

        const result = spawnSync(
          process.execPath,
          ["scripts/run-deploy-sequence.mjs", project],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              PATH: `${tempDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
              RUN_DEPLOY_SEQUENCE_TEST_LOG: logPath,
              DEPLOY_ALLOW_DIRTY: "1",
              DEPLOY_ALLOW_NON_MASTER: "1",
              VITE_API_URL: "https://api.gavelhouse.app",
            },
            encoding: "utf8",
          },
        );

        expect(result.status, result.stderr).toBe(0);
        const commands = readFileSync(logPath, "utf8");
        expect(commands).toContain("wrangler deploy");
        expect(commands).toContain("BUILD_COMMIT:abc1234");
        expect(commands).not.toContain("wrangler pages deploy");
        if (project === "web") {
          expect(commands).not.toContain("upload-lead-magnet-pdfs-to-r2");
          expect(commands).not.toContain("verify-lead-magnet-r2");
          expect(result.stdout).toContain(
            "skipping lead magnet R2 upload because Gavelhouse is shut down.",
          );
        }
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});

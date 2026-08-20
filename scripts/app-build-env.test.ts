import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

const scriptPath = "apps/app/scripts/assert-build-env.ts";

vi.setConfig({ testTimeout: 20_000 });

function runScript(env: NodeJS.ProcessEnv = {}, args: string[] = []) {
  return spawnSync("pnpm", ["exec", "tsx", scriptPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

describe("app build env guard", () => {
  it("allows local builds without VITE_API_URL when strict checks are off", () => {
    const result = runScript({
      VITE_API_URL: "",
      CF_PAGES: "",
      CI: "",
    });

    expect(result.status).toBe(0);
  });

  it("allows local localhost API URLs when strict checks are off", () => {
    const result = runScript({
      VITE_API_URL: "http://localhost:8060",
      CF_PAGES: "",
      CI: "",
    });

    expect(result.status).toBe(0);
  });

  it("fails strict builds when VITE_API_URL is missing", () => {
    const result = runScript(
      {
        VITE_API_URL: "",
        CF_PAGES: "1",
      },
      ["--strict"],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing VITE_API_URL");
  });

  it("fails strict builds for private network origins", () => {
    const result = runScript(
      {
        VITE_API_URL: "http://192.168.1.10:8060",
      },
      ["--strict"],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-HTTPS API origin");
  });

  it("fails strict builds for host.docker.internal", () => {
    const result = runScript(
      {
        VITE_API_URL: "https://host.docker.internal:8060",
      },
      ["--strict"],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-public API origin");
  });

  it("fails master branch Pages builds when the API host is not production", () => {
    const result = runScript({
      VITE_API_URL: "https://staging-api.gavelhouse.app",
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "master",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Production deploys must target https://api.gavelhouse.app",
    );
  });

  it("accepts the production API origin for strict builds", () => {
    const result = runScript(
      {
        VITE_API_URL: "https://api.gavelhouse.app",
        CF_PAGES: "1",
        CF_PAGES_BRANCH: "master",
      },
      ["--strict"],
    );

    expect(result.status).toBe(0);
  });
});

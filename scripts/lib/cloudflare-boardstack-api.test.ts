import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  BOARDSTACK_API_TAG,
  EXPECTED_PRODUCTION_TRIGGER,
  diffProductionTrigger,
  fetchJson,
  findMissingSecrets,
  getAppsApiDir,
  getCloudflareAccountId,
  getCloudflareApiToken,
  getRepoRoot,
  parseWranglerSecrets,
  readGavelhouseApiSecretNamesWithDeps,
  verifyBuildTrigger,
} from "./cloudflare-boardstack-api";

const BOARDSTACK_ACCOUNT_ID = "test-account-id";

describe("cloudflare boardstack api helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefers CLOUDFLARE_API_TOKEN over other env vars", () => {
    expect(
      getCloudflareApiToken({
        CLOUDFLARE_API_TOKEN: "cf-token",
        CF_API_TOKEN: "legacy-token",
        WRANGLER_API_TOKEN: "wrangler-token",
      }),
    ).toBe("cf-token");
  });

  it("falls back through legacy Cloudflare token env vars", () => {
    expect(
      getCloudflareApiToken({
        CF_API_TOKEN: "legacy-token",
        WRANGLER_API_TOKEN: "wrangler-token",
      }),
    ).toBe("legacy-token");
    expect(
      getCloudflareApiToken({
        WRANGLER_API_TOKEN: "wrangler-token",
      }),
    ).toBe("wrangler-token");
    expect(getCloudflareApiToken({})).toBeUndefined();
  });

  it("prefers CLOUDFLARE_ACCOUNT_ID over the legacy env var", () => {
    expect(
      getCloudflareAccountId({
        CLOUDFLARE_ACCOUNT_ID: "cf-account",
        CF_ACCOUNT_ID: "legacy-account",
      }),
    ).toBe("cf-account");
  });

  it("falls back to CF_ACCOUNT_ID and reports nothing when unset", () => {
    expect(getCloudflareAccountId({ CF_ACCOUNT_ID: "legacy-account" })).toBe(
      "legacy-account",
    );
    expect(getCloudflareAccountId({})).toBeUndefined();
  });

  it("reports no diffs when the trigger matches the expected config", () => {
    const diffs = diffProductionTrigger({
      external_script_id: BOARDSTACK_API_TAG,
      ...EXPECTED_PRODUCTION_TRIGGER,
      branch_includes: [...EXPECTED_PRODUCTION_TRIGGER.branch_includes],
      branch_excludes: [...EXPECTED_PRODUCTION_TRIGGER.branch_excludes],
      path_includes: [...EXPECTED_PRODUCTION_TRIGGER.path_includes],
      path_excludes: [...EXPECTED_PRODUCTION_TRIGGER.path_excludes],
    });

    expect(diffs).toEqual([]);
  });

  it("reports drift when the deploy command is outdated", () => {
    const diffs = diffProductionTrigger({
      external_script_id: BOARDSTACK_API_TAG,
      ...EXPECTED_PRODUCTION_TRIGGER,
      deploy_command: "pnpm exec wrangler deploy --config wrangler.toml",
      branch_includes: [...EXPECTED_PRODUCTION_TRIGGER.branch_includes],
      branch_excludes: [...EXPECTED_PRODUCTION_TRIGGER.branch_excludes],
      path_includes: [...EXPECTED_PRODUCTION_TRIGGER.path_includes],
      path_excludes: [...EXPECTED_PRODUCTION_TRIGGER.path_excludes],
    });

    expect(diffs).toContain(
      `expected deploy_command "${EXPECTED_PRODUCTION_TRIGGER.deploy_command}" but found "pnpm exec wrangler deploy --config wrangler.toml"`,
    );
  });

  it("reports drift for every production trigger field", () => {
    const diffs = diffProductionTrigger({
      external_script_id: "old-tag",
      trigger_name: "Preview deploy",
      root_directory: "/apps/web",
      build_command: "pnpm build",
      deploy_command: "pnpm deploy",
      branch_includes: ["main"],
      branch_excludes: ["master"],
      path_includes: ["apps/web/*"],
      path_excludes: ["apps/api/*"],
    });

    expect(diffs).toEqual([
      `expected external_script_id ${BOARDSTACK_API_TAG} but found old-tag`,
      `expected trigger_name ${EXPECTED_PRODUCTION_TRIGGER.trigger_name} but found Preview deploy`,
      `expected root_directory ${EXPECTED_PRODUCTION_TRIGGER.root_directory} but found /apps/web`,
      `expected build_command "${EXPECTED_PRODUCTION_TRIGGER.build_command}" but found "pnpm build"`,
      `expected deploy_command "${EXPECTED_PRODUCTION_TRIGGER.deploy_command}" but found "pnpm deploy"`,
      "branch_includes does not match the expected production branch",
      "branch_excludes does not match the expected empty exclusion list",
      "path_includes does not match the monorepo-safe API watch paths",
      "path_excludes does not match the expected non-API exclusions",
    ]);
  });

  it("reports missing trigger fields", () => {
    const diffs = diffProductionTrigger({});

    expect(diffs).toContain(
      `expected external_script_id ${BOARDSTACK_API_TAG} but found <missing>`,
    );
    expect(diffs).toContain(
      `expected trigger_name ${EXPECTED_PRODUCTION_TRIGGER.trigger_name} but found <missing>`,
    );
    expect(diffs).toContain(
      `expected root_directory ${EXPECTED_PRODUCTION_TRIGGER.root_directory} but found <missing>`,
    );
  });

  it("throws with Cloudflare status details when fetchJson fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("denied", {
          status: 403,
          statusText: "Forbidden",
        }),
      ),
    );

    await expect(fetchJson("cf-token", "/forbidden")).rejects.toThrow(
      "Cloudflare API /forbidden failed with 403 Forbidden",
    );
  });

  it("lists build triggers by current worker tag", async () => {
    const requestedPaths: string[] = [];

    vi.stubGlobal("fetch", async (url: string | URL) => {
      const pathName = String(url).replace(
        "https://api.cloudflare.com/client/v4",
        "",
      );
      requestedPaths.push(pathName);

      if (pathName === `/accounts/${BOARDSTACK_ACCOUNT_ID}/workers/scripts`) {
        return new Response(
          JSON.stringify({
            result: [{ id: "boardstack-api", tag: BOARDSTACK_API_TAG }],
          }),
        );
      }

      if (
        pathName ===
        `/accounts/${BOARDSTACK_ACCOUNT_ID}/builds/workers/${BOARDSTACK_API_TAG}/triggers`
      ) {
        return new Response(
          JSON.stringify({
            result: [
              {
                external_script_id: BOARDSTACK_API_TAG,
                ...EXPECTED_PRODUCTION_TRIGGER,
                branch_includes: [
                  ...EXPECTED_PRODUCTION_TRIGGER.branch_includes,
                ],
                branch_excludes: [
                  ...EXPECTED_PRODUCTION_TRIGGER.branch_excludes,
                ],
                path_includes: [...EXPECTED_PRODUCTION_TRIGGER.path_includes],
                path_excludes: [...EXPECTED_PRODUCTION_TRIGGER.path_excludes],
              },
            ],
          }),
        );
      }

      return new Response("not found", {
        status: 404,
        statusText: "Not Found",
      });
    });

    await expect(
      verifyBuildTrigger("cf-token", BOARDSTACK_ACCOUNT_ID),
    ).resolves.toEqual({
      found: true,
      diffs: [],
    });
    expect(requestedPaths).toContain(
      `/accounts/${BOARDSTACK_ACCOUNT_ID}/builds/workers/${BOARDSTACK_API_TAG}/triggers`,
    );
  });

  it("reports when the boardstack API worker is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: [{ id: "other-worker", tag: "other-tag" }],
          }),
        ),
      ),
    );

    await expect(
      verifyBuildTrigger("cf-token", BOARDSTACK_ACCOUNT_ID),
    ).resolves.toEqual({
      found: false,
      diffs: ["worker boardstack-api was not found in Cloudflare"],
    });
  });

  it("reports when the production trigger is missing for the current worker", async () => {
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const pathName = String(url).replace(
        "https://api.cloudflare.com/client/v4",
        "",
      );

      if (pathName === `/accounts/${BOARDSTACK_ACCOUNT_ID}/workers/scripts`) {
        return new Response(
          JSON.stringify({
            result: [{ id: "boardstack-api", tag: BOARDSTACK_API_TAG }],
          }),
        );
      }

      return new Response(
        JSON.stringify({
          result: [
            {
              external_script_id: BOARDSTACK_API_TAG,
              trigger_name: "Preview deploy",
            },
          ],
        }),
      );
    });

    await expect(
      verifyBuildTrigger("cf-token", BOARDSTACK_ACCOUNT_ID),
    ).resolves.toEqual({
      found: false,
      diffs: [
        `no production trigger found for boardstack-api (tag ${BOARDSTACK_API_TAG})`,
      ],
    });
  });

  it("parses wrangler secret list output", () => {
    expect(
      parseWranglerSecrets(
        JSON.stringify([
          { name: "DATABASE_URL", type: "secret_text" },
          { name: "BETTER_AUTH_SECRET", type: "secret_text" },
        ]),
      ),
    ).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
  });

  it("resolves repo and API paths from the script module location", () => {
    expect(existsSync(path.join(getRepoRoot(), "package.json"))).toBe(true);
    expect(existsSync(path.join(getRepoRoot(), "pnpm-workspace.yaml"))).toBe(
      true,
    );
    expect(getAppsApiDir()).toBe(path.join(getRepoRoot(), "apps", "api"));
    expect(existsSync(path.join(getAppsApiDir(), "package.json"))).toBe(true);
  });

  it("reads boardstack API secret names through Wrangler", () => {
    const execFileSync = vi.fn().mockReturnValue(
      JSON.stringify([
        { name: "DATABASE_URL", type: "secret_text" },
        { name: "BETTER_AUTH_SECRET", type: "secret_text" },
      ]),
    );

    expect(
      readGavelhouseApiSecretNamesWithDeps({
        execFileSync,
        platform: "linux",
        comSpec: undefined,
      }),
    ).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
    expect(execFileSync).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "wrangler", "secret", "list", "--name", "boardstack-api"],
      {
        cwd: getAppsApiDir(),
        encoding: "utf-8",
      },
    );
  });

  it("uses cmd.exe for Wrangler secret listing on Windows", () => {
    const execFileSync = vi.fn().mockReturnValue(
      JSON.stringify([
        { name: "DATABASE_URL", type: "secret_text" },
        { name: "BETTER_AUTH_SECRET", type: "secret_text" },
      ]),
    );

    expect(
      readGavelhouseApiSecretNamesWithDeps({
        execFileSync,
        platform: "win32",
        comSpec: "C:\\Windows\\System32\\cmd.exe",
      }),
    ).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
    expect(execFileSync).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        "pnpm exec wrangler secret list --name boardstack-api",
      ],
      {
        cwd: getAppsApiDir(),
        encoding: "utf-8",
      },
    );
  });

  it("falls back to cmd.exe when ComSpec is not set on Windows", () => {
    const execFileSync = vi.fn().mockReturnValue("[]");

    readGavelhouseApiSecretNamesWithDeps({
      execFileSync,
      platform: "win32",
      comSpec: undefined,
    });

    expect(execFileSync.mock.calls[0]?.[0]).toBe("cmd.exe");
  });

  it("finds the missing production secrets", () => {
    expect(findMissingSecrets(["BETTER_AUTH_SECRET", "DATABASE_URL"])).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_STARTER_ANNUAL",
      "STRIPE_PRICE_GROWTH_MONTHLY",
      "STRIPE_PRICE_GROWTH_ANNUAL",
      "STRIPE_PRICE_SCALE_MONTHLY",
      "STRIPE_PRICE_SCALE_ANNUAL",
      "RESEND_API_KEY",
      "LEAD_MAGNET_DOWNLOAD_SECRET",
      "TURNSTILE_SECRET_KEY",
      "COMPANY_POSTAL_ADDRESS",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]);
  });
});

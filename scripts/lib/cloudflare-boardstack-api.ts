import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const BOARDSTACK_API_NAME = "boardstack-api";
/**
 * The Worker script's Cloudflare-generated tag, pinned so drift in the build
 * trigger is caught. It identifies a script inside one account and is inert
 * without that account's id, which this file deliberately does not carry.
 */
export const BOARDSTACK_API_TAG = "640cbfa51c78430bac4b9fea92f18fe9";

export const REQUIRED_BOARDSTACK_API_SECRETS = [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
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
] as const;

export const EXPECTED_BUILD_WATCH_PATHS = {
  include: [
    "apps/api/*",
    "packages/shared/*",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.base.json",
  ],
  exclude: ["docs/*", "screenshots/*", "apps/app/*", "apps/web/*"],
} as const;

export const EXPECTED_PRODUCTION_TRIGGER = {
  trigger_name: "Deploy production",
  root_directory: "/apps/api",
  build_command: "pnpm install --frozen-lockfile",
  deploy_command:
    "pnpm exec wrangler deploy --config wrangler.toml --name boardstack-api",
  branch_includes: ["master"],
  branch_excludes: [],
  path_includes: [...EXPECTED_BUILD_WATCH_PATHS.include],
  path_excludes: [...EXPECTED_BUILD_WATCH_PATHS.exclude],
} as const;

type TriggerShape = {
  trigger_name?: string;
  root_directory?: string;
  build_command?: string;
  deploy_command?: string;
  branch_includes?: string[];
  branch_excludes?: string[];
  path_includes?: string[];
  path_excludes?: string[];
  external_script_id?: string;
};

type SecretShape = {
  name: string;
  type: string;
};

type WorkersScriptsResponse = {
  result: Array<{
    id: string;
    tag: string;
  }>;
};

type BuildsTriggersResponse = {
  result: TriggerShape[];
};

export function getCloudflareApiToken(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return (
    env["CLOUDFLARE_API_TOKEN"] ??
    env["CF_API_TOKEN"] ??
    env["WRANGLER_API_TOKEN"] ??
    undefined
  );
}

/**
 * Read from the environment rather than hardcoded, alongside the token it is
 * useless without. An account id grants nothing on its own, but it is a stable
 * name for an account that outlives this project, and this repository is
 * published publicly.
 */
export function getCloudflareAccountId(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env["CLOUDFLARE_ACCOUNT_ID"] ?? env["CF_ACCOUNT_ID"] ?? undefined;
}

function equalStringArrays(actual: string[] = [], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function diffProductionTrigger(trigger: TriggerShape): string[] {
  const diffs: string[] = [];

  if (trigger.external_script_id !== BOARDSTACK_API_TAG) {
    diffs.push(
      `expected external_script_id ${BOARDSTACK_API_TAG} but found ${
        trigger.external_script_id ?? "<missing>"
      }`,
    );
  }

  if (trigger.trigger_name !== EXPECTED_PRODUCTION_TRIGGER.trigger_name) {
    diffs.push(
      `expected trigger_name ${EXPECTED_PRODUCTION_TRIGGER.trigger_name} but found ${
        trigger.trigger_name ?? "<missing>"
      }`,
    );
  }

  if (trigger.root_directory !== EXPECTED_PRODUCTION_TRIGGER.root_directory) {
    diffs.push(
      `expected root_directory ${EXPECTED_PRODUCTION_TRIGGER.root_directory} but found ${
        trigger.root_directory ?? "<missing>"
      }`,
    );
  }

  if (trigger.build_command !== EXPECTED_PRODUCTION_TRIGGER.build_command) {
    diffs.push(
      `expected build_command "${EXPECTED_PRODUCTION_TRIGGER.build_command}" but found "${
        trigger.build_command ?? "<missing>"
      }"`,
    );
  }

  if (trigger.deploy_command !== EXPECTED_PRODUCTION_TRIGGER.deploy_command) {
    diffs.push(
      `expected deploy_command "${EXPECTED_PRODUCTION_TRIGGER.deploy_command}" but found "${
        trigger.deploy_command ?? "<missing>"
      }"`,
    );
  }

  if (
    !equalStringArrays(
      trigger.branch_includes,
      EXPECTED_PRODUCTION_TRIGGER.branch_includes,
    )
  ) {
    diffs.push("branch_includes does not match the expected production branch");
  }

  if (
    !equalStringArrays(
      trigger.branch_excludes,
      EXPECTED_PRODUCTION_TRIGGER.branch_excludes,
    )
  ) {
    diffs.push(
      "branch_excludes does not match the expected empty exclusion list",
    );
  }

  if (
    !equalStringArrays(
      trigger.path_includes,
      EXPECTED_PRODUCTION_TRIGGER.path_includes,
    )
  ) {
    diffs.push(
      "path_includes does not match the monorepo-safe API watch paths",
    );
  }

  if (
    !equalStringArrays(
      trigger.path_excludes,
      EXPECTED_PRODUCTION_TRIGGER.path_excludes,
    )
  ) {
    diffs.push("path_excludes does not match the expected non-API exclusions");
  }

  return diffs;
}

export function parseWranglerSecrets(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as SecretShape[];
  return parsed.map((secret) => secret.name).sort();
}

export function findMissingSecrets(currentSecretNames: string[]): string[] {
  const current = new Set(currentSecretNames);
  return REQUIRED_BOARDSTACK_API_SECRETS.filter((name) => !current.has(name));
}

export function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function getAppsApiDir(): string {
  return path.join(getRepoRoot(), "apps", "api");
}

type ReadSecretNamesDeps = {
  execFileSync: typeof execFileSync;
  platform: NodeJS.Platform;
  comSpec: string | undefined;
};

export function readGavelhouseApiSecretNamesWithDeps({
  execFileSync,
  platform,
  comSpec,
}: ReadSecretNamesDeps): string[] {
  const stdout =
    platform === "win32"
      ? execFileSync(
          comSpec ?? "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            `pnpm exec wrangler secret list --name ${BOARDSTACK_API_NAME}`,
          ],
          {
            cwd: getAppsApiDir(),
            encoding: "utf-8",
          },
        )
      : execFileSync(
          "pnpm",
          ["exec", "wrangler", "secret", "list", "--name", BOARDSTACK_API_NAME],
          {
            cwd: getAppsApiDir(),
            encoding: "utf-8",
          },
        );

  return parseWranglerSecrets(stdout);
}

/* v8 ignore start -- thin process wrapper; command behavior is covered via dependency injection. */
export function readGavelhouseApiSecretNames(): string[] {
  return readGavelhouseApiSecretNamesWithDeps({
    execFileSync,
    platform: process.platform,
    comSpec: process.env["ComSpec"],
  });
}
/* v8 ignore stop */

export async function fetchJson<T>(
  token: string,
  pathName: string,
): Promise<T> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4${pathName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Cloudflare API ${pathName} failed with ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

export async function verifyBuildTrigger(
  token: string,
  accountId: string,
): Promise<{ diffs: string[]; found: boolean }> {
  const scripts = await fetchJson<WorkersScriptsResponse>(
    token,
    `/accounts/${accountId}/workers/scripts`,
  );
  const boardstackApi = scripts.result.find(
    (script) => script.id === BOARDSTACK_API_NAME,
  );

  if (!boardstackApi) {
    return {
      found: false,
      diffs: [`worker ${BOARDSTACK_API_NAME} was not found in Cloudflare`],
    };
  }

  const triggers = await fetchJson<BuildsTriggersResponse>(
    token,
    `/accounts/${accountId}/builds/workers/${boardstackApi.tag}/triggers`,
  );
  const trigger = triggers.result.find(
    (candidate) =>
      candidate.external_script_id === boardstackApi.tag &&
      candidate.trigger_name === EXPECTED_PRODUCTION_TRIGGER.trigger_name,
  );

  if (!trigger) {
    return {
      found: false,
      diffs: [
        `no production trigger found for ${BOARDSTACK_API_NAME} (tag ${boardstackApi.tag})`,
      ],
    };
  }

  return {
    found: true,
    diffs: diffProductionTrigger({
      ...trigger,
      external_script_id: boardstackApi.tag,
    }),
  };
}

import {
  PUBLIC_API_URL,
  PUBLIC_APP_URL,
  PUBLIC_WEB_URL,
} from "../../packages/shared/src/index.js";

export type VerifyProject = "api" | "app" | "web";

export type VerifyOptions = {
  project: VerifyProject;
  expectedCommit: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type VerifyResult = {
  ok: boolean;
  servedCommit: string | null;
  attempts: number;
};

const URLS: Record<VerifyProject, string> = {
  web: `${PUBLIC_WEB_URL}/`,
  app: `${PUBLIC_APP_URL}/`,
  api: `${PUBLIC_API_URL}/api/health`,
};

export function urlForProject(project: VerifyProject): string {
  return URLS[project];
}

const META_REGEX =
  /<meta\s+[^>]*name=["']build-commit["'][^>]*content=["']([^"']+)["'][^>]*>/i;
const META_REGEX_ALT =
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']build-commit["'][^>]*>/i;

export function parseCommitFromHtml(html: string): string | null {
  const match = META_REGEX.exec(html) ?? META_REGEX_ALT.exec(html);
  return match ? match[1] : null;
}

export function parseCommitFromJson(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "commit" in parsed &&
      typeof (parsed as { commit: unknown }).commit === "string"
    ) {
      return (parsed as { commit: string }).commit;
    }
  } catch {
    return null;
  }
  return null;
}

const SHA_REGEX = /^[0-9a-f]{7,40}$/i;

export function commitMatches(
  expected: string,
  served: string | null,
): boolean {
  if (!served) return false;
  const e = expected.toLowerCase();
  const s = served.toLowerCase();
  if (!SHA_REGEX.test(e) || !SHA_REGEX.test(s)) return false;
  return e === s || e.startsWith(s) || s.startsWith(e);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function verifyLiveCommit(
  options: VerifyOptions,
): Promise<VerifyResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;

  const url = urlForProject(options.project);
  const deadline = now() + timeoutMs;

  let attempts = 0;
  let lastServed: string | null = null;

  while (now() <= deadline) {
    attempts += 1;
    try {
      // All verify URLs are hardcoded and contain no query string, so "?" is
      // always the correct separator for the cache-busting param.
      const bustedUrl = `${url}?_=${now()}`;
      const response = await fetchImpl(bustedUrl, {
        headers: {
          "cache-control": "no-store",
          pragma: "no-cache",
        },
      });
      const body = await response.text();
      const served =
        options.project === "api"
          ? parseCommitFromJson(body)
          : parseCommitFromHtml(body);
      lastServed = served;
      if (commitMatches(options.expectedCommit, served)) {
        return { ok: true, servedCommit: served, attempts };
      }
    } catch {
      // Transient network errors get retried until the deadline.
    }

    if (now() + pollIntervalMs > deadline) {
      break;
    }
    await sleepImpl(pollIntervalMs);
  }

  return { ok: false, servedCommit: lastServed, attempts };
}

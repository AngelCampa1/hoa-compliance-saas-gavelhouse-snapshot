/**
 * Reads content/linkedin/manifest.json and schedules each post to Postiz via
 * the public API. It writes one .uploaded.json receipt next to each source post
 * and retries 429 responses with adaptive backoff.
 *
 * Auth priority:
 *   1. --api-key <token>
 *   2. POSTIZ_API_KEY
 *   3. ~/.postiz/credentials.json with accessToken
 *
 * Usage:
 *   node scripts/postiz-upload.mjs [--integration-id <id>] [--api-key <token>] [--dry-run] [--from YYYY-MM-DD]
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { assertLinkedInPostsReviewed } from "./linkedin-post-review-gate.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(ROOT, "content", "linkedin", "manifest.json");
const POSTIZ_API_BASE = "https://api.postiz.com/public/v1";
const CREDENTIALS_FILE = join(homedir(), ".postiz", "credentials.json");
const MIN_DELAY_MS = 3_000;
const MAX_DELAY_MS = 144_000;
const POSTIZ_UPLOADS_DISABLED = true;

export function getFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

export function getApiKey({
  args,
  env,
  credentialsFile = CREDENTIALS_FILE,
  exists = existsSync,
  readFile = readFileSync,
}) {
  const fromFlag = getFlag(args, "--api-key");
  if (fromFlag) return fromFlag;
  if (env.POSTIZ_API_KEY) return env.POSTIZ_API_KEY;

  if (exists(credentialsFile)) {
    try {
      const credentials = JSON.parse(readFile(credentialsFile, "utf8"));
      if (credentials.accessToken) return credentials.accessToken;
    } catch {
      // Ignore malformed optional credentials and report no usable key.
    }
  }

  return null;
}

export function getIntegrationId(args, env) {
  return getFlag(args, "--integration-id") ?? env.POSTIZ_INTEGRATION_ID ?? null;
}

export function filterPosts(posts, fromDate) {
  if (!fromDate) return posts;
  return posts.filter((post) => post.scheduledAt.slice(0, 10) >= fromDate);
}

export function receiptPath(filePath, root = ROOT) {
  return join(root, filePath.replace(/\.md$/, ".uploaded.json"));
}

export function isUploaded(filePath, root = ROOT, exists = existsSync) {
  return exists(receiptPath(filePath, root));
}

export function readPostBody(filePath, root = ROOT, readFile = readFileSync) {
  const raw = readFile(join(root, filePath), "utf8").replace(/\r\n/g, "\n");
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Cannot parse frontmatter in ${filePath}`);
  return match[1].trim();
}

export function writeReceipt(
  filePath,
  data,
  root = ROOT,
  writeFile = writeFileSync,
) {
  writeFile(receiptPath(filePath, root), JSON.stringify(data, null, 2), "utf8");
}

export function formatDuration(ms) {
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function createPostizPayload(integrationId, entry, body) {
  return {
    type: "schedule",
    date: entry.scheduledAt,
    shortLink: true,
    tags: [],
    posts: [
      {
        integration: { id: integrationId },
        settings: { __type: "linkedin-page" },
        value: [{ content: body, image: [], delay: 0 }],
      },
    ],
  };
}

export function extractPostizId(result) {
  const first = Array.isArray(result) ? result[0] : result;
  return first?.postId ?? first?.id ?? null;
}

export function nextDelayAfterSuccess(currentDelay) {
  return Math.max(MIN_DELAY_MS, Math.floor(currentDelay * 0.85));
}

export function nextDelayAfterRateLimit(currentDelay, retryAfterSeconds) {
  return retryAfterSeconds > 0
    ? Math.min(MAX_DELAY_MS, retryAfterSeconds * 1_000 + 2_000)
    : Math.min(MAX_DELAY_MS, currentDelay * 2);
}

export async function postToPostiz({
  apiKey,
  integrationId,
  entry,
  body,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${POSTIZ_API_BASE}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(createPostizPayload(integrationId, entry, body)),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") ?? "0", 10);
    const error = new Error("Rate limited (429)");
    error.isRateLimit = true;
    error.retryAfter = retryAfter;
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Postiz API ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runUpload({
  args = process.argv.slice(2),
  env = process.env,
  root = ROOT,
  manifestPath = MANIFEST_PATH,
  readFile = readFileSync,
  writeFile = writeFileSync,
  exists = existsSync,
  fetchImpl = fetch,
  sleepImpl = sleep,
  uploadsDisabled = POSTIZ_UPLOADS_DISABLED,
  now = () => new Date(),
  log = console.log,
  error = console.error,
  exit = process.exit,
} = {}) {
  const dryRun = args.includes("--dry-run");
  const fromDate = getFlag(args, "--from");
  const apiKey = getApiKey({ args, env, exists, readFile });
  const integrationId = getIntegrationId(args, env);
  const { posts } = JSON.parse(readFile(manifestPath, "utf8"));

  if (!posts?.length) {
    error("manifest.json has no posts.");
    exit(1);
    return;
  }

  const filtered = filterPosts(posts, fromDate);

  if (dryRun) {
    const pending = filtered.filter(
      (post) => !isUploaded(post.file, root, exists),
    );
    log("\n-- DRY RUN --");
    log(
      `Total: ${filtered.length} | Pending: ${pending.length} | Done: ${
        filtered.length - pending.length
      }`,
    );
    log(`Integration ID : ${integrationId ?? "(not set)"}`);
    log(
      `API Key source : ${
        getFlag(args, "--api-key")
          ? "CLI flag"
          : env.POSTIZ_API_KEY
            ? "env var"
            : exists(CREDENTIALS_FILE)
              ? "~/.postiz/credentials.json"
              : "(not found)"
      }`,
    );
    log(`Best-case time : ${formatDuration(pending.length * MIN_DELAY_MS)}`);
    exit(0);
    return;
  }

  if (uploadsDisabled) {
    error(
      "Error: LinkedIn/Postiz uploads are disabled because Gavelhouse is shut down.",
    );
    exit(1);
    return;
  }

  if (!apiKey) {
    error(
      "Error: no API key found.\n" +
        "  Run: postiz auth:login\n" +
        "  Or:  export POSTIZ_API_KEY=<key>\n" +
        "  Or:  --api-key <key>",
    );
    exit(1);
    return;
  }

  if (!integrationId) {
    error(
      "Error: --integration-id <id> or POSTIZ_INTEGRATION_ID env var required.",
    );
    exit(1);
    return;
  }

  const pending = filtered.filter(
    (post) => !isUploaded(post.file, root, exists),
  );
  const done = filtered.length - pending.length;
  assertLinkedInPostsReviewed(
    pending.map((post) => ({
      id: post.id,
      content: readPostBody(post.file, root, readFile),
      attachments: [],
      source: post.file,
    })),
  );

  log(`\nPostiz upload - ${now().toLocaleString()}`);
  log(`Integration : ${integrationId}`);
  log(`Pending     : ${pending.length} (${done} already uploaded)\n`);

  if (pending.length === 0) {
    log("All posts already uploaded.");
    exit(0);
    return;
  }

  let delay = MIN_DELAY_MS;
  let succeeded = 0;
  let failed = 0;
  const start = Date.now();

  for (let index = 0; index < pending.length; index += 1) {
    const entry = pending[index];
    const remaining = pending.length - index - 1;
    const elapsed = Date.now() - start;
    const average = succeeded > 0 ? elapsed / succeeded : delay;
    const eta = formatDuration(remaining * average);

    process.stdout.write(`[${index + 1}/${pending.length}] ${entry.id}... `);

    let body;
    try {
      body = readPostBody(entry.file, root, readFile);
    } catch (err) {
      log(`SKIP (${err.message})`);
      failed += 1;
      continue;
    }

    let posted = false;
    for (let attempt = 1; attempt <= 5 && !posted; attempt += 1) {
      try {
        const result = await postToPostiz({
          apiKey,
          integrationId,
          entry,
          body,
          fetchImpl,
        });
        const postizId = extractPostizId(result);
        if (!postizId) {
          throw new Error(`No post ID in response: ${JSON.stringify(result)}`);
        }
        writeReceipt(
          entry.file,
          {
            uploadedAt: now().toISOString(),
            postizId,
            entry,
          },
          root,
          writeFile,
        );
        delay = nextDelayAfterSuccess(delay);
        log(`OK (${postizId}) delay=${formatDuration(delay)} eta=${eta}`);
        succeeded += 1;
        posted = true;
      } catch (err) {
        if (err.isRateLimit) {
          delay = nextDelayAfterRateLimit(delay, err.retryAfter);
          if (attempt === 5) {
            log(`FAILED: rate limited after ${attempt} attempts`);
            failed += 1;
            break;
          }
          log(
            `\n  429 - backing off to ${formatDuration(delay)}, retry ${attempt}/5...`,
          );
          await sleepImpl(delay);
        } else {
          log(`FAILED: ${err.message}`);
          failed += 1;
          break;
        }
      }
    }

    if (index < pending.length - 1) await sleepImpl(delay);
  }

  const elapsed = formatDuration(Date.now() - start);
  log(
    `\n-- Done ${now().toLocaleString()} (${elapsed}) --` +
      `\n  Uploaded : ${succeeded}` +
      `\n  Failed   : ${failed}` +
      `\n  Total    : ${pending.length}`,
  );

  if (failed > 0) exit(1);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedPath === import.meta.url) {
  runUpload().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}

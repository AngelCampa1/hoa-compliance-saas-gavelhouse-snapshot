import {
  mkdirSync,
  appendFileSync,
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Page, APIRequestContext } from "@playwright/test";

/**
 * Shared helpers for the screenshot archive specs (capture-*.spec.ts).
 *
 * These specs are documentation tooling rather than tests: they drive a locally
 * seeded stack and write PNGs into docs/screenshots/ for the README and for
 * future write-ups. They need a bootstrapped and seeded stack and run for
 * minutes, so `pnpm --filter @boardstack/app run e2e` filters them out by
 * describe title and `run e2e:capture` is the way in. Every capture describe
 * must therefore be titled "screenshot archive — …" for that filter to hold.
 *
 * See docs/screenshots/README.md for the generated index.
 */

/** Repo-root-relative output directory, overridable for one-off runs. */
export const ARCHIVE_ROOT =
  process.env["SCREENSHOT_ARCHIVE_DIR"] ??
  path.resolve(process.cwd(), "..", "..", "docs", "screenshots");

/** Marketing site origin. The dashboard uses playwright.config.ts baseURL. */
export const WEB_ORIGIN =
  process.env["SCREENSHOT_WEB_URL"] ?? "http://localhost:3061";

/** API origin, used for programmatic login. */
export const API_ORIGIN =
  process.env["SCREENSHOT_API_URL"] ?? "http://localhost:8060";

export interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Full-page captures are large; reserve them for the viewports we publish. */
  readonly fullPage: boolean;
}

export const DESKTOP_WIDE: Viewport = {
  name: "1920",
  width: 1920,
  height: 1080,
  fullPage: false,
};
export const DESKTOP: Viewport = {
  name: "1440",
  width: 1440,
  height: 900,
  fullPage: true,
};
export const TABLET: Viewport = {
  name: "768",
  width: 768,
  height: 1024,
  fullPage: false,
};
export const MOBILE: Viewport = {
  name: "375",
  width: 375,
  height: 812,
  fullPage: true,
};

export const APP_VIEWPORTS = [DESKTOP_WIDE, DESKTOP, TABLET, MOBILE] as const;
export const WEB_VIEWPORTS = [DESKTOP, MOBILE] as const;

/** Seeded demo accounts created by `pnpm --filter @boardstack/api run seed:demo`. */
export const DEMO_PASSWORD = "Test1234!";
export const TREASURER_EMAIL = "treasurer@test.gavelhouse.app";
export const PORTFOLIO_EMAIL = "portfolio@test.gavelhouse.app";
export const EMPTY_EMAIL = "empty@test.gavelhouse.app";

const MANIFEST_PATH = path.join(ARCHIVE_ROOT, ".manifest.jsonl");

export interface ManifestEntry {
  readonly file: string;
  readonly surface: string;
  readonly route: string;
  readonly viewport: string;
}

/**
 * The manifest is append-only across specs, which lets the capture specs run
 * independently and in any order. `scripts/render-screenshot-index.ts` treats
 * the PNGs on disk as the source of truth and uses the manifest only to enrich
 * them with route and viewport, so duplicate or stale lines are harmless.
 */
function recordManifest(entry: ManifestEntry): void {
  mkdirSync(ARCHIVE_ROOT, { recursive: true });
  appendFileSync(MANIFEST_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

/** Turn a route into a stable, filesystem-safe basename. */
export function slugify(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "index";
  return trimmed.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

/**
 * Wait for the page to settle before capturing. Dashboard screens fetch through
 * TanStack Query after mount, so a naive screenshot catches skeletons.
 */
export async function settle(page: Page): Promise<void> {
  // Bounded on purpose. `networkidle` never arrives on a screen that holds a
  // connection open or re-polls, and an unbounded wait there does not fail the
  // one screenshot — it burns the whole serial run's budget and skips every
  // route after it.
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);

  // After a client-side navigation networkidle resolves immediately — the
  // previous page already left the network quiet — so checking for skeletons
  // right away passes before the new route has even mounted them. Give render
  // a beat first, then wait for them to clear. `animate-pulse` is the marker
  // on components/ui/skeleton.tsx.
  await page.waitForTimeout(600);
  await page
    .waitForFunction(
      () => document.querySelectorAll(".animate-pulse").length === 0,
      undefined,
      // Short on purpose: if skeletons are still up after this, the query is
      // not slow, it is stuck, and waiting longer will not produce a better
      // screenshot. Capture what is there and move on.
      { timeout: 8_000 },
    )
    .catch(() => undefined);

  // Give chart and table animations a beat to finish.
  await page.waitForTimeout(400);
}

export interface CaptureOptions {
  readonly page: Page;
  readonly surface: string;
  readonly route: string;
  readonly viewport: Viewport;
  /** Override the derived filename, e.g. for interaction states. */
  readonly name?: string;
}

/**
 * Ceiling on full-page capture height.
 *
 * Some marketing pages run past 58,000px, which produces a 6-11MB PNG that no
 * one will ever scroll through. Clipping keeps the archive to a size worth
 * committing while still showing far more than the fold.
 */
const MAX_FULLPAGE_HEIGHT = 6000;

/**
 * Height the viewport would need for every screen to show all of its content.
 *
 * Marketing pages scroll the document, so `documentElement.scrollHeight` is the
 * answer. Dashboard screens do not: the shell pins itself to `h-screen` and
 * scrolls an inner `#main-content` instead, leaving the document's scrollHeight
 * stuck at the viewport height. There the answer is the document height plus
 * whatever `#main-content` has hidden below its own fold.
 */
async function measureContentHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const documentHeight = document.documentElement.scrollHeight;
    const main = document.querySelector("#main-content");
    if (!main) return documentHeight;
    return documentHeight + (main.scrollHeight - main.clientHeight);
  });
}

/** Screenshot the current page into the archive and record it in the manifest. */
export async function capture(options: CaptureOptions): Promise<string> {
  const { page, surface, route, viewport, name } = options;
  const dir = path.join(ARCHIVE_ROOT, surface);
  mkdirSync(dir, { recursive: true });

  const basename = name ?? slugify(route);
  const file = path.join(dir, `${basename}.png`);

  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  const pageHeight = viewport.fullPage
    ? await measureContentHeight(page)
    : viewport.height;
  const clipped = viewport.fullPage && pageHeight > MAX_FULLPAGE_HEIGHT;

  // `fullPage` only follows the *document* scroll. The dashboard shell is
  // `h-screen overflow-hidden` with the routes rendered inside an
  // `overflow-y-auto` main element (see routes/_app.tsx), so the document never
  // scrolls and a full-page capture of any dashboard screen returns exactly the
  // fold. Growing the viewport to the content height is what actually reveals
  // the rest, because the inner scroller then has nothing left to scroll.
  if (viewport.fullPage && pageHeight > viewport.height) {
    await page.setViewportSize({
      width: viewport.width,
      height: Math.min(pageHeight, MAX_FULLPAGE_HEIGHT),
    });
    // Resizing reflows, and on the dashboard it also lets more of a virtualised
    // or lazily-rendered list mount. Give that a beat before capturing.
    await page.waitForTimeout(400);
  }

  await page.screenshot(
    clipped
      ? {
          path: file,
          // `fullPage` must stay on. Without it Playwright resolves `clip`
          // against the viewport rather than the document and silently returns
          // a viewport-height image — the clip becomes a truncation.
          fullPage: true,
          clip: {
            x: 0,
            y: 0,
            width: viewport.width,
            height: MAX_FULLPAGE_HEIGHT,
          },
        }
      : { path: file, fullPage: viewport.fullPage },
  );

  recordManifest({
    file: path.relative(ARCHIVE_ROOT, file).split(path.sep).join("/"),
    surface,
    route,
    viewport: `${viewport.width}x${viewport.height}`,
  });
  return file;
}

/**
 * Navigate, settle, and capture in one step.
 *
 * The status assertion matters: apps/web sets `trailingSlash: "always"`, so a
 * route written without one renders a 404 page that screenshots perfectly
 * happily. An archive quietly full of 404s is worse than a failed run.
 */
export async function visitAndCapture(
  options: CaptureOptions & {
    readonly origin?: string;
    /** Set for routes expected to 404, e.g. the 404 page itself. */
    readonly expectStatus?: number;
  },
): Promise<void> {
  const { page, route, origin, expectStatus = 200 } = options;
  const response = await page.goto(origin ? `${origin}${route}` : route);

  const status = response?.status();
  if (status !== undefined && status !== expectStatus) {
    throw new Error(
      `${route} returned ${status}, expected ${expectStatus}. ` +
        `On a marketing route this usually means a missing trailing slash ` +
        `(apps/web sets trailingSlash: "always"); on a dashboard route it ` +
        `usually means the cached session expired.`,
    );
  }

  await settle(page);
  await capture(options);
}

type BrowserCookie = Awaited<
  ReturnType<APIRequestContext["storageState"]>
>["cookies"][number];

interface StoredCookies {
  readonly cookies: BrowserCookie[];
}

/** Where a signed-in session is cached between capture specs. */
function sessionPath(email: string): string {
  return path.join(
    ARCHIVE_ROOT,
    ".sessions",
    `${email.replace(/[^a-z0-9]/gi, "-")}.json`,
  );
}

/**
 * Sign in and put the session cookie on the page.
 *
 * The session is cached on disk and reused across specs. That is not only
 * faster than driving the login form: the auth endpoints are rate limited to
 * five requests per fifteen minutes per IP, so a full archive run that signed
 * in once per test would lock itself out partway through.
 */
export async function loginAs(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const cachePath = sessionPath(email);

  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as StoredCookies;
    await page.context().addCookies([...cached.cookies]);

    // Confirm the cached session still authenticates before relying on it.
    const probe = await page.request.get(`${API_ORIGIN}/api/auth/get-session`);
    if (probe.ok() && (await probe.text()).includes("user")) return;
    rmSync(cachePath);
  }

  const response = await request.post(`${API_ORIGIN}/api/auth/sign-in/email`, {
    data: { email, password: DEMO_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(
      `Sign-in failed for ${email}: ${response.status()} ${await response.text()}. ` +
        `A 429 means the auth rate limit tripped — wait 15 minutes or restart the API worker.`,
    );
  }

  const state = await request.storageState();
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify({ cookies: state.cookies }), "utf8");
  await page.context().addCookies(state.cookies);
}

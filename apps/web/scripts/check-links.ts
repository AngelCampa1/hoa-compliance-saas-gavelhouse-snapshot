/**
 * Broken-link checker for the built marketing site (apps/web/dist).
 *
 * - Walks dist/**\/*.html
 * - Extracts every <a href>
 * - Resolves internal links against the generated page set, following
 *   _redirects chains up to 5 hops, reporting cycles and unresolved targets
 * - Optionally HEAD/GETs external links (skippable with --no-external)
 * - Writes apps/web/broken-links-report.json
 *
 * Usage:
 *   tsx scripts/check-links.ts              # default: scan dist/, skip external
 *   tsx scripts/check-links.ts --external   # also probe external URLs
 *   tsx scripts/check-links.ts --origin=https://gavelhouse.app  # verify against live origin
 */

import fs from "node:fs";
import path from "node:path";
import { BRAND_DOMAIN } from "@boardstack/shared";

interface RedirectRule {
  from: string;
  to: string;
  status: number;
}

interface BrokenLink {
  from: string;
  href: string;
  reason: string;
}

interface RedirectHop {
  from: string;
  href: string;
  resolvedTo: string;
  chain: string[];
}

interface ExternalIssue {
  from: string;
  href: string;
  status: number | string;
}

interface Report {
  generatedAt: string;
  origin: string;
  totals: {
    pagesScanned: number;
    linksScanned: number;
    internalLinks: number;
    externalLinks: number;
    brokenInternal: number;
    redirectHops: number;
    externalFailures: number;
  };
  broken: BrokenLink[];
  redirectHops: RedirectHop[];
  externalFailures: ExternalIssue[];
  externalSkipped: boolean;
}

const WEB_ROOT = path.resolve(process.cwd());
const DIST_DIR = path.join(WEB_ROOT, "dist");
const REDIRECTS_FILE = path.join(WEB_ROOT, "public", "_redirects");
const REPORT_FILE = path.join(WEB_ROOT, "broken-links-report.json");

const args = process.argv.slice(2);
const CHECK_EXTERNAL = args.includes("--external");
const originArg = args.find((a) => a.startsWith("--origin="));
const ORIGIN = originArg ? originArg.split("=", 2)[1] : "";
const maxPagesArg = args.find((a) => a.startsWith("--max-pages="));
const MAX_LIVE_PAGES = maxPagesArg
  ? Number.parseInt(maxPagesArg.split("=", 2)[1], 10)
  : 100;

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtml(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function distPathToUrl(filePath: string): string {
  const rel = path.relative(DIST_DIR, filePath).replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html"))
    return `/${rel.slice(0, -"index.html".length)}`;
  if (rel.endsWith(".html")) return `/${rel.slice(0, -".html".length)}`;
  return `/${rel}`;
}

function parseRedirects(): RedirectRule[] {
  if (!fs.existsSync(REDIRECTS_FILE)) return [];
  const text = fs.readFileSync(REDIRECTS_FILE, "utf8");
  const rules: RedirectRule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const from = parts[0];
    const to = parts[1];
    const status = parts[2] ? Number.parseInt(parts[2], 10) : 301;
    rules.push({ from, to, status });
  }
  return rules;
}

function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1] ?? m[2] ?? "";
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) =>
    match[1].trim(),
  );
}

async function expandSitemapUrls(
  sitemapUrl: string,
  sitemapText: string,
  seen: Set<string>,
): Promise<string[]> {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);

  const locs = extractLocs(sitemapText);
  if (locs.length === 0) return [];

  const isSitemapIndex = /<sitemapindex\b/i.test(sitemapText);
  const isUrlSet = /<urlset\b/i.test(sitemapText);
  if (!isSitemapIndex && isUrlSet) {
    return locs.map((loc) => new URL(loc, sitemapUrl).toString());
  }

  const pages: string[] = [];
  for (const loc of locs) {
    const childUrl = new URL(loc, sitemapUrl).toString();
    if (seen.has(childUrl)) continue;
    const response = await fetch(childUrl, { redirect: "follow" });
    if (!response.ok) continue;
    const childText = await response.text();
    pages.push(...(await expandSitemapUrls(childUrl, childText, seen)));
  }
  return pages;
}

function normalizeInternal(href: string): {
  pathname: string;
  hash: string;
  search: string;
} {
  const [beforeHash, hash = ""] = href.split("#", 2);
  const [pathname, search = ""] = beforeHash.split("?", 2);
  return {
    pathname,
    hash: hash ? `#${hash}` : "",
    search: search ? `?${search}` : "",
  };
}

function ensureTrailingSlash(p: string): string {
  if (p === "" || p === "/") return "/";
  // Files with extension: leave as-is (e.g. /robots.txt, /llms.txt, /rss.xml)
  if (/\.[a-z0-9]+$/i.test(p)) return p;
  return p.endsWith("/") ? p : `${p}/`;
}

function resolveWithRedirects(
  start: string,
  pages: Set<string>,
  redirects: RedirectRule[],
  publicFiles: Set<string>,
): { ok: boolean; resolved: string; chain: string[]; reason?: string } {
  const chain: string[] = [];
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (chain.includes(current)) {
      return { ok: false, resolved: current, chain, reason: "redirect-cycle" };
    }
    chain.push(current);
    if (pages.has(current) || publicFiles.has(current)) {
      return { ok: true, resolved: current, chain };
    }
    const rule = redirects.find((r) => r.from === current);
    if (!rule) {
      return {
        ok: false,
        resolved: current,
        chain,
        reason: "no-matching-page-or-redirect",
      };
    }
    current = rule.to;
  }
  return {
    ok: false,
    resolved: current,
    chain,
    reason: "redirect-depth-exceeded",
  };
}

function walkPublic(dir: string, base: string, out: Set<string>): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      walkPublic(full, base, out);
    } else {
      out.add(`/${rel}`);
    }
  }
}

async function probeExternal(url: string): Promise<number | string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }
    return res.status;
  } catch (err) {
    return (err as Error).name === "AbortError" ? "timeout" : "network-error";
  } finally {
    clearTimeout(timeout);
  }
}

async function probeAll(urls: Map<string, string[]>): Promise<ExternalIssue[]> {
  const entries = [...urls.entries()];
  const issues: ExternalIssue[] = [];
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      const [href, froms] = entries[i];
      const status = await probeExternal(href);
      const ok = typeof status === "number" && status >= 200 && status < 400;
      if (!ok) {
        for (const from of froms) {
          issues.push({ from, href, status });
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return issues;
}

async function main() {
  if (ORIGIN) {
    const originUrl = new URL(ORIGIN);
    const sitemapUrl = new URL("/sitemap-index.xml", originUrl);
    const livePages = [originUrl.toString()];
    try {
      const sitemapResponse = await fetch(sitemapUrl, { redirect: "follow" });
      if (sitemapResponse.ok) {
        const sitemapText = await sitemapResponse.text();
        const locs = await expandSitemapUrls(
          sitemapUrl.toString(),
          sitemapText,
          new Set<string>(),
        );
        if (locs.length > 0) {
          livePages.splice(
            0,
            livePages.length,
            ...locs.slice(0, MAX_LIVE_PAGES),
          );
        }
      }
    } catch {
      // Fall back to checking the origin root when the sitemap is unavailable.
    }

    const broken: BrokenLink[] = [];
    let linksScanned = 0;
    let internalLinks = 0;
    let externalLinks = 0;
    const internalMap = new Map<string, string[]>();
    const externalMap = new Map<string, string[]>();

    for (const pageUrl of livePages.slice(0, MAX_LIVE_PAGES)) {
      const response = await fetch(pageUrl, { redirect: "follow" });
      if (!response.ok) {
        broken.push({
          from: pageUrl,
          href: pageUrl,
          reason: String(response.status),
        });
        continue;
      }
      const html = await response.text();
      for (const href of extractHrefs(html)) {
        linksScanned += 1;
        if (
          !href ||
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("javascript:")
        ) {
          continue;
        }
        let resolved: URL;
        try {
          resolved = new URL(href, pageUrl);
        } catch {
          broken.push({ from: pageUrl, href, reason: "invalid-url" });
          continue;
        }
        resolved.hash = "";
        if (resolved.origin === originUrl.origin) {
          internalLinks += 1;
          const list = internalMap.get(resolved.toString()) ?? [];
          list.push(pageUrl);
          internalMap.set(resolved.toString(), list);
          continue;
        }
        externalLinks += 1;
        const list = externalMap.get(resolved.toString()) ?? [];
        list.push(pageUrl);
        externalMap.set(resolved.toString(), list);
      }
    }

    for (const [href, froms] of internalMap.entries()) {
      const status = await probeExternal(href);
      const ok = typeof status === "number" && status >= 200 && status < 400;
      if (!ok) {
        for (const from of froms) {
          broken.push({ from, href, reason: String(status) });
        }
      }
    }

    const externalFailures =
      CHECK_EXTERNAL && externalMap.size > 0 ? await probeAll(externalMap) : [];
    const report: Report = {
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      totals: {
        pagesScanned: livePages.slice(0, MAX_LIVE_PAGES).length,
        linksScanned,
        internalLinks,
        externalLinks,
        brokenInternal: broken.length,
        redirectHops: 0,
        externalFailures: externalFailures.length,
      },
      broken,
      redirectHops: [],
      externalFailures,
      externalSkipped: !CHECK_EXTERNAL,
    };
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `Scanned ${report.totals.pagesScanned} live pages / ${linksScanned} links - ${broken.length} broken internal, ${externalFailures.length} external failures.`,
    );
    console.log(`Report: ${REPORT_FILE}`);
    if (broken.length > 0) process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(DIST_DIR)) {
    console.error(
      `dist not found at ${DIST_DIR}. Run 'pnpm --filter @boardstack/web build' first.`,
    );
    process.exit(2);
  }

  const htmlFiles = walkHtml(DIST_DIR);
  const pages = new Set<string>();
  for (const f of htmlFiles) pages.add(distPathToUrl(f));

  const publicFiles = new Set<string>();
  walkPublic(
    path.join(WEB_ROOT, "public"),
    path.join(WEB_ROOT, "public"),
    publicFiles,
  );
  // Also include non-HTML files that were copied into dist (PDFs, images, text).
  (function walkDistAssets(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDistAssets(full);
      } else if (entry.isFile() && !entry.name.endsWith(".html")) {
        const rel = path.relative(DIST_DIR, full).replace(/\\/g, "/");
        publicFiles.add(`/${rel}`);
      }
    }
  })(DIST_DIR);

  const redirects = parseRedirects();

  const broken: BrokenLink[] = [];
  const redirectHops: RedirectHop[] = [];
  const externalMap = new Map<string, string[]>();
  let linksScanned = 0;
  let internalLinks = 0;
  let externalLinks = 0;

  for (const file of htmlFiles) {
    const from = distPathToUrl(file);
    const html = fs.readFileSync(file, "utf8");
    const hrefs = extractHrefs(html);
    for (const href of hrefs) {
      linksScanned += 1;
      if (!href) continue;
      if (href.startsWith("#")) continue;
      if (
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      )
        continue;
      if (/^(https?:)?\/\//i.test(href)) {
        // External (or protocol-relative). Skip if origin points back at our own host.
        externalLinks += 1;
        try {
          const u = new URL(href.startsWith("//") ? `https:${href}` : href);
          if (
            u.hostname === BRAND_DOMAIN ||
            u.hostname === `www.${BRAND_DOMAIN}`
          ) {
            // Treat as internal
            const { pathname } = u;
            const normalized = ensureTrailingSlash(pathname);
            const result = resolveWithRedirects(
              normalized,
              pages,
              redirects,
              publicFiles,
            );
            if (!result.ok) {
              broken.push({
                from,
                href,
                reason: result.reason ?? "unresolved",
              });
            } else if (result.chain.length > 1) {
              redirectHops.push({
                from,
                href,
                resolvedTo: result.resolved,
                chain: result.chain,
              });
            }
          } else {
            const list = externalMap.get(href) ?? [];
            list.push(from);
            externalMap.set(href, list);
          }
        } catch {
          broken.push({ from, href, reason: "invalid-url" });
        }
        continue;
      }
      if (!href.startsWith("/")) {
        // Relative link — should not appear in a trailingSlash:always site. Flag.
        broken.push({ from, href, reason: "relative-link-not-allowed" });
        continue;
      }
      internalLinks += 1;
      const { pathname } = normalizeInternal(href);
      const normalized = ensureTrailingSlash(pathname);
      const result = resolveWithRedirects(
        normalized,
        pages,
        redirects,
        publicFiles,
      );
      if (!result.ok) {
        broken.push({ from, href, reason: result.reason ?? "unresolved" });
      } else if (result.chain.length > 1) {
        redirectHops.push({
          from,
          href,
          resolvedTo: result.resolved,
          chain: result.chain,
        });
      }
    }
  }

  let externalFailures: ExternalIssue[] = [];
  if (CHECK_EXTERNAL && externalMap.size > 0) {
    console.log(`Probing ${externalMap.size} unique external URLs...`);
    externalFailures = await probeAll(externalMap);
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN || "dist/",
    totals: {
      pagesScanned: htmlFiles.length,
      linksScanned,
      internalLinks,
      externalLinks,
      brokenInternal: broken.length,
      redirectHops: redirectHops.length,
      externalFailures: externalFailures.length,
    },
    broken,
    redirectHops,
    externalFailures,
    externalSkipped: !CHECK_EXTERNAL,
  };

  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `Scanned ${htmlFiles.length} pages / ${linksScanned} links — ${broken.length} broken internal, ${redirectHops.length} redirect-hops, ${externalFailures.length} external failures.`,
  );
  console.log(`Report: ${REPORT_FILE}`);

  if (broken.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

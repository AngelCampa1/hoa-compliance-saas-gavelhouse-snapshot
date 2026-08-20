import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import puppeteer, { type Browser } from "puppeteer";
import { extractToc } from "./extract-toc.js";
import { renderPdfHtml } from "./pdf-template.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(WEB_ROOT, "src", "content", "lead-magnets");
const OUTPUT_DIR = path.join(WEB_ROOT, ".lead-magnet-pdfs");
const LEGACY_PUBLIC_DOWNLOADS_DIR = path.join(WEB_ROOT, "public", "downloads");
const PUPPETEER_INSTALL_ARGS = ["exec", "puppeteer", "browsers", "install"];

interface Frontmatter {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  bluf: string;
  tags: string[];
}

const REQUIRED_KEYS = [
  "title",
  "description",
  "publishedAt",
  "updatedAt",
  "bluf",
  "tags",
] as const;

function assertFrontmatter(
  data: Record<string, unknown>,
  sourcePath: string,
): Frontmatter {
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === "") {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing frontmatter keys [${missing.join(",")}] in ${sourcePath}`,
    );
  }
  const tags = data.tags;
  if (!Array.isArray(tags)) {
    throw new Error(`Frontmatter "tags" must be an array in ${sourcePath}`);
  }
  return {
    title: String(data.title),
    description: String(data.description),
    publishedAt: String(data.publishedAt),
    updatedAt: String(data.updatedAt),
    bluf: String(data.bluf),
    tags: tags.map((t) => String(t)),
  };
}

function isMissingChromeError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Could not find Chrome");
}

async function installChromeForPuppeteer(): Promise<void> {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  console.log(
    "[generate-pdfs] Chrome not found. Installing Puppeteer browser binary...",
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pnpmCommand, [...PUPPETEER_INSTALL_ARGS, "chrome"], {
      cwd: WEB_ROOT,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to start Puppeteer browser install via ${pnpmCommand}: ${error.message}`,
        ),
      );
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Puppeteer browser install exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (err) {
    if (!isMissingChromeError(err)) {
      throw err;
    }

    await installChromeForPuppeteer();

    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

async function renderMagnet(
  browser: Browser,
  filePath: string,
): Promise<{
  slug: string;
  outPath: string;
  size: number;
}> {
  const slug = path.basename(filePath, ".md");
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const fm = assertFrontmatter(
    parsed.data as Record<string, unknown>,
    filePath,
  );
  const toc = extractToc(parsed.content);
  const bodyHtml = await marked.parse(parsed.content, { async: true });
  const html = renderPdfHtml({
    title: fm.title,
    description: fm.description,
    bluf: fm.bluf,
    publishedAt: fm.publishedAt,
    bodyHtml,
    toc,
  });

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const outPath = path.join(OUTPUT_DIR, `${slug}.pdf`);
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "20mm",
        right: "20mm",
      },
      preferCSSPageSize: true,
    });
    const stats = await fs.stat(outPath);
    return { slug, outPath, size: stats.size };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  if (process.env.PDF_SKIP === "1") {
    console.log("[generate-pdfs] PDF_SKIP=1 set, skipping PDF generation.");
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const entries = (await fs.readdir(CONTENT_DIR))
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (entries.length === 0) {
    throw new Error(`No markdown found in ${CONTENT_DIR}`);
  }

  await Promise.all(
    entries.map((file) =>
      fs
        .rm(
          path.join(LEGACY_PUBLIC_DOWNLOADS_DIR, file.replace(/\.md$/, ".pdf")),
          {
            force: true,
          },
        )
        .catch(() => undefined),
    ),
  );

  console.log(
    `[generate-pdfs] Found ${entries.length} magnets. Launching Puppeteer...`,
  );

  const browser = await launchBrowser();

  try {
    for (const file of entries) {
      const filePath = path.join(CONTENT_DIR, file);
      console.log(`[generate-pdfs] Rendering ${file}...`);
      const result = await renderMagnet(browser, filePath);
      const kb = (result.size / 1024).toFixed(1);
      console.log(
        `[generate-pdfs]   -> ${path.relative(WEB_ROOT, result.outPath)} (${kb} KB)`,
      );
    }
  } finally {
    await browser.close();
  }

  console.log("[generate-pdfs] Done.");
}

main().catch((err: unknown) => {
  console.error("[generate-pdfs] Failed:", err);
  process.exit(1);
});

import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

describe("check-links live origin mode", () => {
  const tsxLoader = pathToFileURL(
    path.resolve(process.cwd(), "node_modules/tsx/dist/loader.mjs"),
  ).href;
  const scriptPath = path.resolve(process.cwd(), "scripts/check-links.ts");

  function runCheckLinks(tempDir: string, origin: string, maxPages = 1) {
    return new Promise<{
      status: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          tsxLoader,
          scriptPath,
          `--origin=${origin}`,
          `--max-pages=${maxPages}`,
        ],
        { cwd: tempDir, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("check-links timed out"));
      }, 15_000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });
  }

  async function withServer(
    handler: Parameters<typeof createServer>[0],
    callback: (origin: string) => void | Promise<void>,
  ) {
    const server = createServer(handler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not bind to a TCP port.");
    }
    try {
      await callback(`http://127.0.0.1:${address.port}`);
    } finally {
      server.close();
      server.closeAllConnections();
    }
  }

  it("does not require local dist when --origin is provided", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "boardstack-links-"));

    try {
      await withServer(
        (_req, res) => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<a href='/ok/'>OK</a>");
        },
        async (origin) => {
          const result = await runCheckLinks(tempDir, origin);

          expect(result.stderr).not.toContain("dist not found");
        },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports same-origin links that return 404", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "boardstack-links-"));

    try {
      await withServer(
        (req, res) => {
          if (req.url ==="/missing/") {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("missing");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<a href='/missing/'>Missing</a>");
        },
        async (origin) => {
          const result = await runCheckLinks(tempDir, origin);

          expect(result.status).toBe(1);
          const report = JSON.parse(
            readFileSync(
              path.join(tempDir, "broken-links-report.json"),
              "utf8",
            ),
          ) as {
            broken: Array<{ from: string; href: string; reason: string }>;
          };
          expect(report.broken).toEqual([
            { from: `${origin}/`, href: `${origin}/missing/`, reason: "404" },
          ]);
        },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports malformed hrefs without crashing", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "boardstack-links-"));

    try {
      await withServer(
        (_req, res) => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<a href='http://[invalid'>Bad</a>");
        },
        async (origin) => {
          const result = await runCheckLinks(tempDir, origin);

          expect(result.status).toBe(1);
          const report = JSON.parse(
            readFileSync(
              path.join(tempDir, "broken-links-report.json"),
              "utf8",
            ),
          ) as {
            broken: Array<{ from: string; href: string; reason: string }>;
          };
          expect(report.broken).toEqual([
            {
              from: `${origin}/`,
              href: "http://[invalid",
              reason: "invalid-url",
            },
          ]);
        },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("expands sitemap indexes before scanning live pages", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "boardstack-links-"));

    try {
      await withServer(
        (req, res) => {
          if (req.url ==="/sitemap-index.xml") {
            res.writeHead(200, { "Content-Type": "application/xml" });
            res.end(
              "<?xml version='1.0' encoding='UTF-8'?>" +
                "<sitemapindex>" +
                "<sitemap><loc>/sitemap-0.xml</loc></sitemap>" +
                "</sitemapindex>",
            );
            return;
          }
          if (req.url ==="/sitemap-0.xml") {
            res.writeHead(200, { "Content-Type": "application/xml" });
            res.end(
              "<?xml version='1.0' encoding='UTF-8'?>" +
                "<urlset>" +
                "<url><loc>/page/</loc></url>" +
                "</urlset>",
            );
            return;
          }
          if (req.url ==="/missing/") {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("missing");
            return;
          }
          if (req.url ==="/page/") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<a href='/missing/'>Missing</a>");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<a href='/ok/'>OK</a>");
        },
        async (origin) => {
          const result = await runCheckLinks(tempDir, origin, 5);

          expect(result.status).toBe(1);
          const report = JSON.parse(
            readFileSync(
              path.join(tempDir, "broken-links-report.json"),
              "utf8",
            ),
          ) as {
            totals: { pagesScanned: number };
            broken: Array<{ from: string; href: string; reason: string }>;
          };
          expect(report.totals.pagesScanned).toBe(1);
          expect(report.broken).toEqual([
            {
              from: `${origin}/page/`,
              href: `${origin}/missing/`,
              reason: "404",
            },
          ]);
        },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

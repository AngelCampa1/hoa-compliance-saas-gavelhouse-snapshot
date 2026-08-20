import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEAD_MAGNET_SLUGS, type LeadMagnetSlug } from "@boardstack/shared";
import {
  LEAD_MAGNET_PDF_OUTPUT_DIR,
  verifyLeadMagnetPdfs,
} from "./verify-lead-magnet-pdfs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const WEB_ROOT = path.resolve(__dirname, "..");
export const DEFAULT_LEAD_MAGNET_R2_BUCKET = "boardstack-lead-magnets";

export type WranglerRunner = (args: string[]) => void | Promise<void>;

export function getLeadMagnetR2BucketName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.LEAD_MAGNET_R2_BUCKET || DEFAULT_LEAD_MAGNET_R2_BUCKET;
}

export function getLeadMagnetPdfDirectory(mode: "public" | "dist"): string {
  return mode === "dist"
    ? path.join(WEB_ROOT, "dist", "downloads")
    : LEAD_MAGNET_PDF_OUTPUT_DIR;
}

export function getLeadMagnetObjectPath(
  bucketName: string,
  slug: LeadMagnetSlug,
): string {
  return `${bucketName}/${slug}.pdf`;
}

export function runWrangler(args: string[]): void {
  const wranglerBin = path.join(
    WEB_ROOT,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: WEB_ROOT,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `wrangler ${args.join("")} failed with exit code ${result.status ?? "null"}`,
    );
  }
}

export async function uploadLeadMagnetPdfsToR2(params: {
  directory: string;
  bucketName: string;
  runner?: WranglerRunner;
}): Promise<void> {
  const runner = params.runner ?? runWrangler;

  for (const slug of LEAD_MAGNET_SLUGS) {
    const filePath = path.join(params.directory, `${slug}.pdf`);
    await fs.access(filePath);
    await runner([
      "r2",
      "object",
      "put",
      getLeadMagnetObjectPath(params.bucketName, slug),
      "--file",
      filePath,
      "--content-type",
      "application/pdf",
      "--content-disposition",
      `attachment; filename="${slug}.pdf"`,
      "--remote",
      "--force",
    ]);
  }
}

export async function verifyLeadMagnetPdfsInR2(params: {
  directory: string;
  bucketName: string;
  runner?: WranglerRunner;
}): Promise<void> {
  const runner = params.runner ?? runWrangler;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "boardstack-r2-"));

  try {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const localPath = path.join(params.directory, `${slug}.pdf`);
      const downloadedPath = path.join(tempDir, `${slug}.pdf`);
      await fs.access(localPath);
      await runner([
        "r2",
        "object",
        "get",
        getLeadMagnetObjectPath(params.bucketName, slug),
        "--file",
        downloadedPath,
        "--remote",
      ]);
    }

    await verifyLeadMagnetPdfs(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

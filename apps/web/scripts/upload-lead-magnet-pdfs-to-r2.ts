import {
  getLeadMagnetPdfDirectory,
  getLeadMagnetR2BucketName,
  uploadLeadMagnetPdfsToR2,
} from "./lead-magnet-r2.js";
import { verifyLeadMagnetPdfs } from "./verify-lead-magnet-pdfs.js";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WRANGLER_CONFIG_PATH = join(WEB_ROOT, "wrangler.toml");

export function hasShutdownFlag(wranglerConfig: string): boolean {
  return /^\s*GAVELHOUSE_SHUTDOWN\s*=\s*"true"\s*$/m.test(wranglerConfig);
}

export function assertLeadMagnetUploadsAllowed(
  readWranglerConfig = () => readFileSync(WRANGLER_CONFIG_PATH, "utf8"),
): void {
  if (!hasShutdownFlag(readWranglerConfig())) return;

  throw new Error(
    "Lead magnet R2 uploads are disabled because Gavelhouse is shut down.",
  );
}

async function main(): Promise<void> {
  assertLeadMagnetUploadsAllowed();
  const directory = getLeadMagnetPdfDirectory("public");
  const bucketName = getLeadMagnetR2BucketName();
  await verifyLeadMagnetPdfs(directory);
  await uploadLeadMagnetPdfsToR2({ directory, bucketName });
  console.log(
    `[upload-lead-magnet-pdfs-to-r2] Uploaded lead magnet PDFs to ${bucketName}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error("[upload-lead-magnet-pdfs-to-r2] Failed:", error);
    process.exit(1);
  });
}

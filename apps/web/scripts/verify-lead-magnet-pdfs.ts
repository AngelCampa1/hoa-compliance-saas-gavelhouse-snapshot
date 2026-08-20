import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { LEAD_MAGNET_SLUGS } from "@boardstack/shared";
import { PDFDocument } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");

export const MIN_LEAD_MAGNET_PDF_BYTES = 10_000;
export const LEAD_MAGNET_PDF_OUTPUT_DIR = path.join(
  WEB_ROOT,
  ".lead-magnet-pdfs",
);

export async function verifyLeadMagnetPdfs(
  directory: string,
  minBytes = MIN_LEAD_MAGNET_PDF_BYTES,
): Promise<void> {
  const failures: string[] = [];

  for (const slug of LEAD_MAGNET_SLUGS) {
    const pdfPath = path.join(directory, `${slug}.pdf`);
    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(pdfPath);
    } catch (err) {
      failures.push(`${pdfPath}: missing (${(err as Error).message})`);
      continue;
    }

    if (bytes.byteLength < minBytes) {
      failures.push(
        `${pdfPath}: too small (${bytes.byteLength} bytes, expected at least ${minBytes})`,
      );
      continue;
    }

    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    if (header !== "%PDF-") {
      failures.push(`${pdfPath}: missing %PDF- header`);
      continue;
    }

    const tail = Buffer.from(bytes.slice(-2048)).toString("latin1");
    if (!tail.includes("%%EOF")) {
      failures.push(`${pdfPath}: missing %%EOF marker`);
      continue;
    }

    try {
      await PDFDocument.load(Uint8Array.from(bytes));
    } catch (err) {
      failures.push(`${pdfPath}: failed PDF parse (${(err as Error).message})`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Invalid lead magnet PDFs:\n${failures.map((entry) => `- ${entry}`).join("\n")}`,
    );
  }
}

export async function verifyLeadMagnetPdfsAbsent(
  directory: string,
): Promise<void> {
  const present: string[] = [];

  for (const slug of LEAD_MAGNET_SLUGS) {
    const pdfPath = path.join(directory, `${slug}.pdf`);
    try {
      await fs.access(pdfPath);
      present.push(pdfPath);
    } catch {
      // Expected: private lead magnet PDFs must not ship in static artifacts.
    }
  }

  if (present.length > 0) {
    throw new Error(
      `Lead magnet PDFs must not be publicly deployed:\n${present.map((entry) => `- ${entry}`).join("\n")}`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--dist-absent")) {
    const directory = path.join(WEB_ROOT, "dist", "downloads");
    await verifyLeadMagnetPdfsAbsent(directory);
    console.log(
      `[verify-lead-magnet-pdfs] Confirmed no lead magnet PDFs in ${path.relative(WEB_ROOT, directory)}`,
    );
    return;
  }

  const directory = LEAD_MAGNET_PDF_OUTPUT_DIR;

  await verifyLeadMagnetPdfs(directory);
  console.log(
    `[verify-lead-magnet-pdfs] Verified ${LEAD_MAGNET_SLUGS.length} PDFs in ${path.relative(WEB_ROOT, directory)}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error("[verify-lead-magnet-pdfs] Failed:", error);
    process.exit(1);
  });
}

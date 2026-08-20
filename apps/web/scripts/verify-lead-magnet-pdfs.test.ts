import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { LEAD_MAGNET_SLUGS } from "@boardstack/shared";
import {
  verifyLeadMagnetPdfs,
  verifyLeadMagnetPdfsAbsent,
} from "./verify-lead-magnet-pdfs.js";

async function writePdf(filePath: string): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 200]).drawText("Gavelhouse lead magnet");
  await fs.writeFile(filePath, await pdf.save());
}

describe("verifyLeadMagnetPdfs", () => {
  it("accepts parseable PDFs for every known slug", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-pdfs-"));
    try {
      await Promise.all(
        LEAD_MAGNET_SLUGS.map((slug) =>
          writePdf(path.join(dir, `${slug}.pdf`)),
        ),
      );

      await expect(verifyLeadMagnetPdfs(dir, 100)).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing, tiny, and malformed PDFs", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-pdfs-bad-"));
    try {
      await Promise.all(
        LEAD_MAGNET_SLUGS.slice(1).map((slug) =>
          writePdf(path.join(dir, `${slug}.pdf`)),
        ),
      );
      await fs.writeFile(
        path.join(dir, `${LEAD_MAGNET_SLUGS[1]}.pdf`),
        "%PDF-tiny\n%%EOF",
      );
      await fs.writeFile(
        path.join(dir, `${LEAD_MAGNET_SLUGS[2]}.pdf`),
        "not a pdf but long enough ".repeat(20),
      );

      await expect(verifyLeadMagnetPdfs(dir, 100)).rejects.toThrow(
        /Invalid lead magnet PDFs/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails if lead magnet PDFs are present in a public artifact directory", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-pdfs-public-"));
    try {
      await writePdf(path.join(dir, `${LEAD_MAGNET_SLUGS[0]}.pdf`));

      await expect(verifyLeadMagnetPdfsAbsent(dir)).rejects.toThrow(
        /must not be publicly deployed/,
      );

      rmSync(path.join(dir, `${LEAD_MAGNET_SLUGS[0]}.pdf`));
      await expect(verifyLeadMagnetPdfsAbsent(dir)).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

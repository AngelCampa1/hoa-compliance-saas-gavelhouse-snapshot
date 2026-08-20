import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LEAD_MAGNET_SLUGS } from "@boardstack/shared";
import { PDFDocument } from "pdf-lib";
import {
  DEFAULT_LEAD_MAGNET_R2_BUCKET,
  getLeadMagnetPdfDirectory,
  getLeadMagnetObjectPath,
  getLeadMagnetR2BucketName,
  runWrangler,
  uploadLeadMagnetPdfsToR2,
  verifyLeadMagnetPdfsInR2,
  type WranglerRunner,
} from "./lead-magnet-r2.js";

const childProcessMock = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("node:child_process", () => ({
  default: childProcessMock,
  spawnSync: childProcessMock.spawnSync,
}));

async function writeAllPdfs(directory: string): Promise<void> {
  await Promise.all(LEAD_MAGNET_SLUGS.map((slug) => writePdf(directory, slug)));
}

async function writePdf(directory: string, slug: string): Promise<void> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 80; index += 1) {
    pdf.addPage([300, 200]).drawText(`${slug} page ${index + 1}`);
  }
  await fs.writeFile(path.join(directory, `${slug}.pdf`), await pdf.save());
}

async function writeAllPlaceholderFiles(directory: string): Promise<void> {
  await Promise.all(
    LEAD_MAGNET_SLUGS.map((slug) =>
      fs.writeFile(path.join(directory, `${slug}.pdf`), "placeholder"),
    ),
  );
}

describe("lead magnet R2 helpers", () => {
  it("uses the default bucket unless overridden", () => {
    expect(getLeadMagnetR2BucketName({})).toBe(DEFAULT_LEAD_MAGNET_R2_BUCKET);
    expect(
      getLeadMagnetR2BucketName({ LEAD_MAGNET_R2_BUCKET: "preview" }),
    ).toBe("preview");
  });

  it("builds object paths as bucket/slug.pdf", () => {
    expect(
      getLeadMagnetObjectPath("boardstack-lead-magnets", LEAD_MAGNET_SLUGS[0]),
    ).toBe(`boardstack-lead-magnets/${LEAD_MAGNET_SLUGS[0]}.pdf`);
  });

  it("keeps generated PDFs out of the public static artifact source", () => {
    expect(getLeadMagnetPdfDirectory("public")).toContain(".lead-magnet-pdfs");
    expect(getLeadMagnetPdfDirectory("public")).not.toContain(
      path.join("public", "downloads"),
    );
  });

  it("uploads every known lead magnet PDF with PDF metadata", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-r2-upload-"));
    const calls: string[][] = [];
    const runner: WranglerRunner = (args) => {
      calls.push(args);
    };

    try {
      await writeAllPdfs(dir);
      await uploadLeadMagnetPdfsToR2({
        directory: dir,
        bucketName: "boardstack-lead-magnets",
        runner,
      });

      expect(calls).toHaveLength(LEAD_MAGNET_SLUGS.length);
      expect(calls[0]).toContain("put");
      expect(calls[0]).toContain("--content-type");
      expect(calls[0]).toContain("application/pdf");
      expect(calls[0]).toContain("--remote");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs wrangler without a shell so metadata is passed as one argument", () => {
    runWrangler([
      "r2",
      "object",
      "put",
      "boardstack-lead-magnets/example.pdf",
      "--content-disposition",
      'attachment; filename="example.pdf"',
    ]);

    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining(
          path.join("node_modules", "wrangler", "bin", "wrangler.js"),
        ),
        "r2",
        "object",
        "put",
        "boardstack-lead-magnets/example.pdf",
        "--content-disposition",
        'attachment; filename="example.pdf"',
      ],
      expect.any(Object),
    );
    expect(spawnSync.mock.calls[0]?.[2]).not.toHaveProperty("shell");
  });

  it("downloads every R2 object and verifies parseable PDFs", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-r2-verify-"));
    const runner: WranglerRunner = async (args) => {
      const sourceObject = args[3];
      const outputIndex = args.indexOf("--file") + 1;
      const outputPath = args[outputIndex];
      const slug = path.basename(sourceObject, ".pdf");
      await fs.copyFile(path.join(dir, `${slug}.pdf`), outputPath);
    };

    try {
      await writeAllPdfs(dir);
      await expect(
        verifyLeadMagnetPdfsInR2({
          directory: dir,
          bucketName: "boardstack-lead-magnets",
          runner,
        }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("fails when a downloaded R2 object is not a valid PDF", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-r2-bad-"));
    const runner: WranglerRunner = async (args) => {
      const outputIndex = args.indexOf("--file") + 1;
      await fs.writeFile(args[outputIndex], "different");
    };

    try {
      await writeAllPlaceholderFiles(dir);
      await expect(
        verifyLeadMagnetPdfsInR2({
          directory: dir,
          bucketName: "boardstack-lead-magnets",
          runner,
        }),
      ).rejects.toThrow(/Invalid lead magnet PDFs/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

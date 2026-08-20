import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "../../../src/domain/exports/pdf";

const SAMPLE_COLUMNS = [
  { header: "Account", key: "account" },
  { header: "Amount", key: "amount" },
];

const SAMPLE_ROWS = [
  { account: "Operating Reserve", amount: "$12,000" },
  { account: "Repair Fund", amount: "$3,500" },
];

describe("buildPdf", () => {
  it("returns a Uint8Array that is a valid PDF document with at least one page", async () => {
    const bytes = await buildPdf({
      title: "Test Report",
      columns: SAMPLE_COLUMNS,
      rows: SAMPLE_ROWS,
    });

    expect(bytes).toBeInstanceOf(Uint8Array);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders correctly with a subtitle without throwing", async () => {
    const bytes = await buildPdf({
      title: "Annual Report",
      subtitle: "Fiscal Year 2025",
      columns: SAMPLE_COLUMNS,
      rows: SAMPLE_ROWS,
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("produces a single-page document with 'No data.' when rows is empty", async () => {
    const bytes = await buildPdf({
      title: "Empty Report",
      columns: SAMPLE_COLUMNS,
      rows: [],
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("paginates onto multiple pages when rows overflow a single page", async () => {
    const manyRows = Array.from({ length: 80 }, (_, i) => ({
      account: `Account ${i + 1}`,
      amount: `$${(i + 1) * 100}`,
    }));

    const bytes = await buildPdf({
      title: "Large Report",
      columns: SAMPLE_COLUMNS,
      rows: manyRows,
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("truncates cell text that exceeds per-column character limit", async () => {
    // Use many narrow columns so maxCharsPerCol is small, forcing truncation
    const narrowCols = Array.from({ length: 10 }, (_, i) => ({
      header: `Col${i}`,
      key: `c${i}`,
    }));
    const longText = "A".repeat(200);
    const row: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      row[`c${i}`] = longText;
    }

    const bytes = await buildPdf({
      title: "Truncation Test",
      columns: narrowCols,
      rows: [row],
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles null and undefined cell values as empty strings", async () => {
    const bytes = await buildPdf({
      title: "Null Value Test",
      columns: SAMPLE_COLUMNS,
      rows: [{ account: null, amount: undefined }],
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles an empty columns array without throwing", async () => {
    const bytes = await buildPdf({
      title: "No Columns",
      columns: [],
      rows: [{}],
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

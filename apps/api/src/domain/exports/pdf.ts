/**
 * PDF builder using pdf-lib. Workers-safe: no Node.js built-ins, no Buffer.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PdfColumn = { header: string; key: string };
export type PdfRow = Record<string, string | number | null | undefined>;

export type PdfOptions = {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
};

// Letter size in points
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 11;
const HEADER_SIZE = 10;
const ROW_SIZE = 9;
const FOOTER_SIZE = 8;

const LINE_HEIGHT_HEADER = 16;
const LINE_HEIGHT_ROW = 14;
const FOOTER_MARGIN = 30;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

export async function buildPdf(options: PdfOptions): Promise<Uint8Array> {
  const { title, subtitle, columns, rows } = options;

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const colCount = columns.length;
  const colWidth =
    colCount > 0 ? Math.floor(CONTENT_WIDTH / colCount) : CONTENT_WIDTH;
  // Estimated max chars per column before truncation (7-point average glyph width)
  const maxCharsPerCol = Math.max(4, Math.floor(colWidth / 6));

  const pages: ReturnType<typeof doc.addPage>[] = [];
  let currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(currentPage);
  let y = PAGE_HEIGHT - MARGIN;

  // --- Title ---
  currentPage.drawText(title, {
    x: MARGIN,
    y,
    size: TITLE_SIZE,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= TITLE_SIZE + 6;

  // --- Subtitle (optional) ---
  if (subtitle) {
    currentPage.drawText(subtitle, {
      x: MARGIN,
      y,
      size: SUBTITLE_SIZE,
      font: regular,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= SUBTITLE_SIZE + 8;
  }

  // Extra space before headers
  y -= 6;

  function addHeaderRow(
    page: ReturnType<typeof doc.addPage>,
    yPos: number,
  ): number {
    columns.forEach((col, i) => {
      page.drawText(col.header, {
        x: MARGIN + i * colWidth,
        y: yPos,
        size: HEADER_SIZE,
        font: bold,
        color: rgb(0, 0, 0),
      });
    });
    return yPos - LINE_HEIGHT_HEADER;
  }

  y = addHeaderRow(currentPage, y);

  // --- Body ---
  if (rows.length === 0) {
    currentPage.drawText("No data.", {
      x: MARGIN,
      y,
      size: ROW_SIZE,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  } else {
    for (const row of rows) {
      // Check if we need a new page (leave room for footer)
      if (y < FOOTER_MARGIN + LINE_HEIGHT_ROW + 10) {
        currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        pages.push(currentPage);
        y = PAGE_HEIGHT - MARGIN;
        y = addHeaderRow(currentPage, y);
      }

      columns.forEach((col, i) => {
        const raw = row[col.key];
        const cellText = truncate(
          raw === null || raw === undefined ? "" : String(raw),
          maxCharsPerCol,
        );
        currentPage.drawText(cellText, {
          x: MARGIN + i * colWidth,
          y,
          size: ROW_SIZE,
          font: regular,
          color: rgb(0, 0, 0),
        });
      });
      y -= LINE_HEIGHT_ROW;
    }
  }

  // --- Page footers ---
  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    const footerText = `Page ${idx + 1} of ${totalPages}`;
    const footerWidth = regular.widthOfTextAtSize(footerText, FOOTER_SIZE);
    page.drawText(footerText, {
      x: PAGE_WIDTH - MARGIN - footerWidth,
      y: FOOTER_MARGIN - 10,
      size: FOOTER_SIZE,
      font: regular,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  return doc.save();
}

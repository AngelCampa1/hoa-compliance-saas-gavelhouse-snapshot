/**
 * RFC-4180 CSV writer. Workers-safe: no Node.js built-ins.
 */

type CellValue = string | number | null | undefined;

function escapeCell(value: CellValue): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const str =
    typeof value === "string" && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function writeCsv(headers: string[], rows: CellValue[][]): string {
  const headerLine = headers.map(escapeCell).join(",");
  if (rows.length === 0) {
    return headerLine;
  }
  const dataLines = rows.map((row) => row.map(escapeCell).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

import { calendarDateString, INT32_MAX, INT32_MIN } from "@boardstack/shared";

export type StatementLine = {
  postedDate: string; // "YYYY-MM-DD"
  description: string;
  amountCents: number; // dollars * 100, negative for withdrawals
};

/**
 * Parse a single CSV row into fields, handling RFC-4180 quoted fields.
 * Quoted fields may contain commas and escaped double-quotes ("").
 */
function parseRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= row.length) {
    if (i === row.length) {
      // reached end of row without seeing a final field — add empty if trailing comma
      break;
    }

    if (row[i] === '"') {
      // quoted field
      i++; // skip opening quote
      let field = "";
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            // escaped quote
            field += '"';
            i += 2;
          } else {
            // end of quoted field
            i++; // skip closing quote
            break;
          }
        } else {
          field += row[i];
          i++;
        }
      }
      fields.push(field);
      // skip comma after closing quote
      if (i < row.length && row[i] ===",") i++;
    } else {
      // unquoted field — read until next comma
      const start = i;
      while (i < row.length && row[i] !==",") i++;
      fields.push(row.slice(start, i).trim());
      if (i < row.length) i++; // skip comma
    }
  }

  return fields;
}

/**
 * Convert a decimal dollar string to integer cents.
 * Handles: "123.45" → 12345, "-50.00" → -5000, "100" → 10000
 */
function dollarsToCents(raw: string): number {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIndex = abs.indexOf(".");
  let wholePart: string;
  let fracPart: string;

  if (dotIndex === -1) {
    wholePart = abs;
    fracPart = "00";
  } else {
    wholePart = abs.slice(0, dotIndex);
    fracPart = abs
      .slice(dotIndex + 1)
      .padEnd(2, "0")
      .slice(0, 2);
  }

  const cents = parseInt(wholePart, 10) * 100 + parseInt(fracPart, 10);
  return negative ? -cents : cents;
}

/**
 * Parses a CSV string with headers: posted_date, description, amount.
 * Returns an array of StatementLine objects.
 *
 * Supports RFC-4180 minimal quoting: quoted fields, escaped quotes ("").
 * Throws a descriptive error on malformed rows or missing headers.
 */
export function parseCsv(csv: string): StatementLine[] {
  // Normalize CRLF to LF
  const normalised = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalised.split("\n");

  const headerRow = rawLines[0] as string;
  // Parse the header with the same RFC-4180-aware reader as the data rows.
  // A plain split(",") would keep the surrounding quotes on a quoted header
  // (e.g. `"posted_date"`), so the required-column lookup would fail on an
  // otherwise-valid file — and would mis-split a header containing a comma.
  const headers = parseRow(headerRow).map((h) => h.trim().toLowerCase());

  const postedDateIdx = headers.indexOf("posted_date");
  const descriptionIdx = headers.indexOf("description");
  const amountIdx = headers.indexOf("amount");

  if (postedDateIdx === -1 || descriptionIdx === -1 || amountIdx === -1) {
    throw new Error(
      `Missing required header(s): expected posted_date, description, amount — got: ${headers.join(",")}`,
    );
  }

  const result: StatementLine[] = [];
  const dataLines = rawLines.slice(1);

  for (let lineIdx = 0; lineIdx < dataLines.length; lineIdx++) {
    const raw = dataLines[lineIdx] as string;
    if (raw.trim() === "") continue; // skip blank lines

    const fields = parseRow(raw);

    if (fields.length < 3) {
      throw new Error(
        `Malformed CSV: row ${lineIdx + 1} has ${fields.length} field(s), expected at least 3`,
      );
    }

    const rawPostedDate = (fields[postedDateIdx] ?? "").trim();
    if (!calendarDateString.safeParse(rawPostedDate).success) {
      throw new Error(
        `Malformed CSV: row ${lineIdx + 1} has invalid posted_date "${rawPostedDate}"`,
      );
    }

    const rawAmount = (fields[amountIdx] ?? "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(rawAmount)) {
      throw new Error(
        `Malformed CSV: row ${lineIdx + 1} has invalid amount "${rawAmount}"`,
      );
    }

    const cents = dollarsToCents(rawAmount);
    if (cents < INT32_MIN || cents > INT32_MAX) {
      throw new Error(
        `Malformed CSV: row ${lineIdx + 1} has out-of-range amount "${rawAmount}"`,
      );
    }

    result.push({
      postedDate: rawPostedDate,
      description: fields[descriptionIdx] ?? "",
      amountCents: cents,
    });
  }

  return result;
}

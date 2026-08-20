import type { ReserveComponentInput } from "@boardstack/shared";
import { INT32_MAX } from "@boardstack/shared";

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  rows: ReserveComponentInput[];
  errors: ImportError[];
}

function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch ==="," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

function mapHeaderToField(
  normalized: string,
): keyof ReserveComponentInput | null {
  if (normalized === "component" || normalized === "name") return "name";
  if (
    normalized === "usefullife" ||
    normalized === "useful_life" ||
    normalized === "usefullifeyears"
  )
    return "usefulLifeYears";
  if (
    normalized === "remaininglife" ||
    normalized === "remaining_life" ||
    normalized === "remaininglifeyears"
  )
    return "remainingLifeYears";
  if (
    normalized === "replacementcost" ||
    normalized === "replacement_cost" ||
    normalized === "replacementcostcents"
  )
    return "replacementCostCents";
  if (
    normalized === "currentreserve" ||
    normalized === "current_reserve" ||
    normalized === "currentreservecents"
  )
    return "currentReserveCents";
  return null;
}

function dollarsToCents(value: string): number {
  // String arithmetic (not parseFloat * 100) so half-cent inputs like "1.005"
  // round correctly. IEEE754 represents 1.005*100 as 100.4999999999, which
  // Math.round would truncate to 100 instead of 101.
  const trimmed = value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    return Number.NaN;
  }
  const negative = match[1] === "-";
  const whole = match[2] === "" ? 0 : parseInt(match[2], 10);
  // Pad to 3 fractional digits; the 3rd digit drives half-up rounding to cents.
  const frac = (match[3] ?? "").padEnd(3, "0");
  const centsFromFrac = parseInt(frac.slice(0, 2), 10);
  const roundUp = parseInt(frac.slice(2, 3), 10) >= 5 ? 1 : 0;
  const cents = whole * 100 + centsFromFrac + roundUp;
  return negative ? -cents : cents;
}

function rawCents(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    return Number.NaN;
  }
  return Number(value);
}

function validateComponent(
  data: Record<string, string>,
  fieldMap: Record<string, keyof ReserveComponentInput>,
  rowIndex: number,
  errors: ImportError[],
): ReserveComponentInput | null {
  const getFieldValue = (
    field: keyof ReserveComponentInput,
  ): { value: string; normalizedHeader: string | null } => {
    const csvKey = Object.keys(fieldMap).find((k) => fieldMap[k] === field);
    if (csvKey === undefined) return { value: "", normalizedHeader: null };
    return {
      value: (data[csvKey] ?? "").trim(),
      normalizedHeader: normalizeHeader(csvKey),
    };
  };

  const { value: nameVal } = getFieldValue("name");
  const { value: usefulLifeVal } = getFieldValue("usefulLifeYears");
  const { value: remainingLifeVal } = getFieldValue("remainingLifeYears");
  const replacementCostField = getFieldValue("replacementCostCents");
  const currentReserveField = getFieldValue("currentReserveCents");

  let hasError = false;

  if (!nameVal) {
    errors.push({
      row: rowIndex,
      field: "name",
      message: "name must not be empty",
    });
    hasError = true;
  }

  const usefulLifeYears = parseInt(usefulLifeVal, 10);
  if (isNaN(usefulLifeYears) || usefulLifeYears < 1 || usefulLifeYears > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "usefulLifeYears",
      message: usefulLifeYears > INT32_MAX
        ? `usefulLifeYears must be an integer >= 1 and <= ${INT32_MAX}`
        : "usefulLifeYears must be an integer >= 1",
    });
    hasError = true;
  }

  const remainingLifeYears = parseInt(remainingLifeVal, 10);
  if (isNaN(remainingLifeYears) || remainingLifeYears < 0 || remainingLifeYears > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "remainingLifeYears",
      message: remainingLifeYears > INT32_MAX
        ? `remainingLifeYears must be an integer >= 0 and <= ${INT32_MAX}`
        : "remainingLifeYears must be an integer >= 0",
    });
    hasError = true;
  }

  const replacementCostCents =
    replacementCostField.normalizedHeader === "replacementcostcents"
      ? rawCents(replacementCostField.value)
      : dollarsToCents(replacementCostField.value);
  if (isNaN(replacementCostCents) || replacementCostCents < 0 || replacementCostCents > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "replacementCostCents",
      message: replacementCostCents > INT32_MAX
        ? `replacementCostCents must be >= 0 and <= ${INT32_MAX}`
        : "replacementCostCents must be >= 0",
    });
    hasError = true;
  }

  const currentReserveCents =
    currentReserveField.normalizedHeader === "currentreservecents"
      ? rawCents(currentReserveField.value)
      : dollarsToCents(currentReserveField.value);
  if (isNaN(currentReserveCents) || currentReserveCents < 0 || currentReserveCents > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "currentReserveCents",
      message: currentReserveCents > INT32_MAX
        ? `currentReserveCents must be >= 0 and <= ${INT32_MAX}`
        : "currentReserveCents must be >= 0",
    });
    hasError = true;
  }

  if (hasError) return null;

  // Cross-field validation: remainingLifeYears must be <= usefulLifeYears
  if (!isNaN(usefulLifeYears) && !isNaN(remainingLifeYears) && remainingLifeYears > usefulLifeYears) {
    errors.push({
      row: rowIndex,
      field: "remainingLifeYears",
      message: "remainingLifeYears must be <= usefulLifeYears",
    });
    return null;
  }

  return {
    name: nameVal,
    usefulLifeYears,
    remainingLifeYears,
    replacementCostCents,
    currentReserveCents,
  };
}

export function parseReserveStudyCsv(csvText: string): ImportResult {
  const errors: ImportError[] = [];
  const rows: ReserveComponentInput[] = [];

  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() === "") {
    errors.push({ row: 0, field: "csv", message: "CSV is empty" });
    return { rows, errors };
  }

  const headerLine = lines[0] ?? "";
  const rawHeaders = splitCsvRow(headerLine);

  // Build field map: csvHeader → component field
  const fieldMap: Record<string, keyof ReserveComponentInput> = {};
  for (const raw of rawHeaders) {
    const normalized = normalizeHeader(raw);
    const field = mapHeaderToField(normalized);
    if (field !== null) {
      fieldMap[raw.trim()] = field;
    }
  }

  let rowIndex = 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;

    const values = splitCsvRow(line);
    const data: Record<string, string> = {};
    rawHeaders.forEach((header, idx) => {
      data[header.trim()] = (values[idx] ?? "").trim();
    });

    const component = validateComponent(data, fieldMap, rowIndex, errors);
    if (component !== null) {
      rows.push(component);
    }
    rowIndex++;
  }

  return { rows, errors };
}

function normalizeJsonKey(key: string): keyof ReserveComponentInput | null {
  const lower = key.toLowerCase().replace(/_/g, "");
  if (lower === "name") return "name";
  if (lower === "usefullifeyears" || lower === "usefullife")
    return "usefulLifeYears";
  if (lower === "remaininglifeyears" || lower === "remaininglife")
    return "remainingLifeYears";
  if (lower === "replacementcostcents" || lower === "replacementcost")
    return "replacementCostCents";
  if (lower === "currentreservecents" || lower === "currentreserve")
    return "currentReserveCents";
  return null;
}

function extractField(
  obj: Record<string, unknown>,
  field: keyof ReserveComponentInput,
): unknown {
  // Try camelCase key directly
  if (field in obj) return obj[field];

  // Try any key that normalizes to this field
  for (const key of Object.keys(obj)) {
    if (normalizeJsonKey(key) === field) return obj[key];
  }
  return undefined;
}

function validateJsonComponent(
  obj: Record<string, unknown>,
  rowIndex: number,
  errors: ImportError[],
): ReserveComponentInput | null {
  let hasError = false;

  const nameRaw = extractField(obj, "name");
  const nameVal = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!nameVal) {
    errors.push({ row: rowIndex, field: "name", message: "name is required" });
    hasError = true;
  }

  const usefulLifeRaw = extractField(obj, "usefulLifeYears");
  const usefulLifeYears =
    typeof usefulLifeRaw === "number" ? usefulLifeRaw : NaN;
  if (!Number.isInteger(usefulLifeYears) || usefulLifeYears < 1 || usefulLifeYears > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "usefulLifeYears",
      message: usefulLifeYears > INT32_MAX
        ? `usefulLifeYears must be an integer >= 1 and <= ${INT32_MAX}`
        : "usefulLifeYears must be an integer >= 1",
    });
    hasError = true;
  }

  const remainingLifeRaw = extractField(obj, "remainingLifeYears");
  const remainingLifeYears =
    typeof remainingLifeRaw === "number" ? remainingLifeRaw : NaN;
  if (!Number.isInteger(remainingLifeYears) || remainingLifeYears < 0 || remainingLifeYears > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "remainingLifeYears",
      message: remainingLifeYears > INT32_MAX
        ? `remainingLifeYears must be an integer >= 0 and <= ${INT32_MAX}`
        : "remainingLifeYears must be an integer >= 0",
    });
    hasError = true;
  }

  const replacementCostRaw = extractField(obj, "replacementCostCents");
  const replacementCostCents =
    typeof replacementCostRaw === "number" ? replacementCostRaw : NaN;
  if (!Number.isInteger(replacementCostCents) || replacementCostCents < 0 || replacementCostCents > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "replacementCostCents",
      message: replacementCostCents > INT32_MAX
        ? `replacementCostCents must be an integer >= 0 and <= ${INT32_MAX}`
        : "replacementCostCents must be an integer >= 0",
    });
    hasError = true;
  }

  const currentReserveRaw = extractField(obj, "currentReserveCents");
  const currentReserveCents =
    typeof currentReserveRaw === "number" ? currentReserveRaw : NaN;
  if (!Number.isInteger(currentReserveCents) || currentReserveCents < 0 || currentReserveCents > INT32_MAX) {
    errors.push({
      row: rowIndex,
      field: "currentReserveCents",
      message: currentReserveCents > INT32_MAX
        ? `currentReserveCents must be an integer >= 0 and <= ${INT32_MAX}`
        : "currentReserveCents must be an integer >= 0",
    });
    hasError = true;
  }

  if (hasError) return null;

  // Cross-field validation: remainingLifeYears must be <= usefulLifeYears
  if (!isNaN(usefulLifeYears) && !isNaN(remainingLifeYears) && remainingLifeYears > usefulLifeYears) {
    errors.push({
      row: rowIndex,
      field: "remainingLifeYears",
      message: "remainingLifeYears must be <= usefulLifeYears",
    });
    return null;
  }

  return {
    name: nameVal,
    usefulLifeYears,
    remainingLifeYears,
    replacementCostCents,
    currentReserveCents,
  };
}

export function parseReserveStudyJson(jsonText: string): ImportResult {
  const errors: ImportError[] = [];
  const rows: ReserveComponentInput[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    errors.push({ row: 0, field: "json", message: "Invalid JSON" });
    return { rows, errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push({
      row: 0,
      field: "json",
      message: "JSON must be an array of components",
    });
    return { rows, errors };
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push({
        row: i,
        field: "json",
        message: `Row ${i.toString()} is not an object`,
      });
      continue;
    }

    const component = validateJsonComponent(
      item as Record<string, unknown>,
      i,
      errors,
    );
    if (component !== null) {
      rows.push(component);
    }
  }

  return { rows, errors };
}

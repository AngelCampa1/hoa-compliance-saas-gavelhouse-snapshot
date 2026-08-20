import { rosterRowSchema, type RosterRow } from "@boardstack/shared";

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
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
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const HEADER_MAP: Record<string, keyof RosterRow> = {
  firstname: "firstName",
  first_name: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  address: "address",
  unitnumber: "unitNumber",
  unit_number: "unitNumber",
  unit: "unitNumber",
  moveindate: "moveInDate",
  move_in_date: "moveInDate",
};

const REQUIRED_HEADERS = ["firstName", "lastName", "email", "address"] as const;

export interface RosterImportResult {
  rows: RosterRow[];
  rowNumbers: number[];
  errors: Array<{ row: number; issues: string }>;
}

export function parseRosterCsv(csvText: string): RosterImportResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], rowNumbers: [], errors: [] };

  const headers = splitCsvRow(lines[0]).map(
    (h) => HEADER_MAP[h.trim().toLowerCase()] ?? h.trim().toLowerCase(),
  );

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      rowNumbers: [],
      errors: [
        {
          row: 1,
          issues: `Missing required header(s): ${missingHeaders.join(", ")}`,
        },
      ],
    };
  }

  if (lines.length < 2) return { rows: [], rowNumbers: [], errors: [] };

  const rows: RosterRow[] = [];
  const rowNumbers: number[] = [];
  const errors: Array<{ row: number; issues: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvRow(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const val = (values[idx] ?? "").trim();
      if (val !== "") raw[h as string] = val;
    });

    const parsed = rosterRowSchema.safeParse(raw);
    if (parsed.success) {
      rows.push(parsed.data);
      rowNumbers.push(i + 1);
    } else {
      errors.push({ row: i + 1, issues: parsed.error.message });
    }
  }

  return { rows, rowNumbers, errors };
}

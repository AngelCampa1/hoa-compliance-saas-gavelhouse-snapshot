import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relPath), "utf8");
}

/**
 * Pending/placeholder labels must use a single unicode ellipsis (…), not three
 * ASCII dots, so the dashboard reads consistently everywhere.
 */
const cases: Array<{ file: string; unicode: string; ascii: string }> = [
  {
    file: "components/bank/StatementUpload.tsx",
    unicode: '"Uploading…"',
    ascii: '"Uploading..."',
  },
  {
    file: "components/close/CloseChecklist.tsx",
    unicode: '"Completing…"',
    ascii: '"Completing..."',
  },
  {
    file: "components/feedback-widget.tsx",
    unicode: '"Sending…"',
    ascii: '"Sending..."',
  },
  {
    file: "routes/_app.governance.meetings.tsx",
    unicode: '"Adding…"',
    ascii: '"Adding..."',
  },
  {
    file: "routes/_app.governance.violations.tsx",
    unicode: '"Updating…"',
    ascii: '"Updating..."',
  },
  {
    file: "routes/_app.governance.violations.tsx",
    unicode: '"Uploading…"',
    ascii: '"Uploading..."',
  },
  {
    file: "routes/_app.help.tsx",
    unicode: "downloads…",
    ascii: "downloads...",
  },
];

describe("ellipsis consistency", () => {
  for (const { file, unicode, ascii } of cases) {
    it(`uses a unicode ellipsis in ${file} (${unicode})`, () => {
      const source = read(file);
      expect(source).toContain(unicode);
      expect(source).not.toContain(ascii);
    });
  }
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "src/components/governance/AddHomeownerDialog.tsx",
  "src/routes/_app.governance.meetings.tsx",
  "src/routes/_app.governance.violations.tsx",
  "src/routes/_app.governance.arch-requests.tsx",
];

describe("governance dialog accessibility source", () => {
  it("adds DialogDescription to production dialogs opened in QA", () => {
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("DialogDescription");
    }
  });
});

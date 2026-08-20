import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(__dirname, "..");
const CRM_ORIGIN = "https://crm.ventoralabs.com";

function getDirective(headers: string, name: string): string {
  const csp = headers
    .split(/\r?\n/)
    .find((line) => line.includes("Content-Security-Policy"));
  expect(csp).toBeDefined();
  return (
    csp
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith(`${name} `)) ?? ""
  );
}

describe("app CSP", () => {
  it("allows the CRM feedback widget script and data origins", () => {
    const headers = fs.readFileSync(
      path.join(appRoot, "public", "_headers"),
      "utf8",
    );

    expect(getDirective(headers, "script-src")).toContain(CRM_ORIGIN);
    expect(getDirective(headers, "connect-src")).toContain(CRM_ORIGIN);
  });
});

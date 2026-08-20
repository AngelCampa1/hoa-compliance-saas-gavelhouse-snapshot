import fs from "node:fs";
import path from "node:path";
import { auditPublicPages } from "../src/lib/public-page-audit";

const report = auditPublicPages();
const outputPath = path.resolve(process.cwd(), "public-seo-audit-report.json");

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `Public SEO audit: ${report.summary.totalPages} pages, ${report.errors.length} errors, ${report.warnings.length} warnings.`,
);
console.log(`Wrote ${outputPath}`);

if (report.errors.length > 0 || report.warnings.length > 0) {
  process.exitCode = 1;
}
if (report.warnings.length > 0) {
  console.warn(
    `${report.warnings.length} warning(s) — review audit report for details.`,
  );
}

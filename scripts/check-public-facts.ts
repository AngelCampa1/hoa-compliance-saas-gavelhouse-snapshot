import { findPublicFactViolations } from "./lib/public-facts-guard.js";

const cwd = process.cwd();
const findings = findPublicFactViolations(cwd);

if (findings.length > 0) {
  console.error("Public fact guard found hardcoded or stale public facts:");
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}: ${finding.message}\n  ${finding.text.trim()}`,
    );
  }
  process.exit(1);
}

console.log("Public fact guard passed.");

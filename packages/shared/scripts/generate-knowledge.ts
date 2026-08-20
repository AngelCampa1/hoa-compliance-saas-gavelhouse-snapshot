import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  buildAppHelpKnowledgeJson,
  buildFullKnowledgeJson,
  buildMarketingKnowledgeJson,
  getKnowledgeSafetyViolations,
} from "../src/knowledge/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = resolve(packageRoot, "generated", "knowledge");

const outputs = [
  ["marketing.json", buildMarketingKnowledgeJson()],
  ["app-help.json", buildAppHelpKnowledgeJson()],
  ["full.json", buildFullKnowledgeJson()],
] as const;

const mode = process.argv.includes("--check") ? "check" : "write";

const violations = getKnowledgeSafetyViolations(Object.fromEntries(outputs));

if (violations.length > 0) {
  throw new Error(
    `Knowledge artifacts contain unsafe public data:\n${violations.join("\n")}`,
  );
}

mkdirSync(generatedRoot, { recursive: true });

for (const [fileName, payload] of outputs) {
  const filePath = resolve(generatedRoot, fileName);
  const next = await prettier.format(JSON.stringify(payload), {
    parser: "json",
  });

  if (mode === "check") {
    const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (current !== next) {
      throw new Error(`${filePath} is out of date. Run knowledge:generate.`);
    }
    continue;
  }

  writeFileSync(filePath, next);
}

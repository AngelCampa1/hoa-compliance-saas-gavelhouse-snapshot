/**
 * Shrinks the screenshot archive in place with palette quantization.
 *
 *   pnpm run screenshots:optimize
 *
 * UI screenshots are large flat-colour images, so an indexed palette costs
 * almost nothing visually and typically halves the file. WebP would be smaller
 * still but caps at 16383px per side, which several full-page captures exceed.
 */
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const archiveRoot = path.join(repoRoot, "docs", "screenshots");

const require = createRequire(import.meta.url);
// sharp arrives as a transitive dependency of the Astro image pipeline rather
// than a direct one, so resolve it rather than importing by bare specifier.
const sharp = require("sharp") as (input: Buffer) => {
  png: (options: { palette: boolean; quality: number; effort: number }) => {
    toBuffer: () => Promise<Buffer>;
  };
};

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip dotted entries, matching render-screenshot-index.ts: .sessions/ and
    // .manifest.jsonl are working state, not part of the archive.
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".png")) yield full;
  }
}

let before = 0;
let after = 0;
let count = 0;

for (const file of walk(archiveRoot)) {
  const original = readFileSync(file);
  const optimized = await sharp(original)
    .png({ palette: true, quality: 80, effort: 7 })
    .toBuffer();

  before += original.length;
  count += 1;

  // Keep whichever is smaller; quantization occasionally loses on tiny images.
  if (optimized.length < original.length) {
    writeFileSync(file, optimized);
    after += optimized.length;
  } else {
    after += original.length;
  }
}

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `Optimized ${count} screenshots: ${mb(before)} MB to ${mb(after)} MB ` +
    `(${Math.round((1 - after / before) * 100)}% smaller).`,
);

if (statSync(archiveRoot).isDirectory() && after > 25 * 1024 * 1024) {
  console.warn(
    `Archive is ${mb(after)} MB, above the 25 MB budget. ` +
      `Consider dropping a viewport from the capture specs.`,
  );
}

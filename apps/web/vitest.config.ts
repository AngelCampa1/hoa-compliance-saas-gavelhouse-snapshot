import os from "os";
import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Use a unique system temp dir per process so coverage runs do not contend for
// the same intermediate artifacts on Windows.
const coverageDir = path.join(
  os.tmpdir(),
  `boardstack-web-coverage-${process.pid}`,
);

export default defineConfig({
  plugins: [react()],
  test: {
    pool: "forks",
    maxWorkers: 4,
    minWorkers: 1,
    fileParallelism: true,
    // jsdom is required for src/** tests that use React, DOM APIs, localStorage, etc.
    // __tests__/** pure-function tests also work fine under jsdom.
    environment: "jsdom",
    // globals: true is required for @testing-library/jest-dom to register matchers.
    globals: true,
    include: [
      "__tests__/**/*.test.ts",
      "__tests__/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**"],
    coverage: {
      provider: "istanbul",
      reportOnFailure: true,
      reportsDirectory: coverageDir,
      // Cover all migrated TypeScript source files across components, lib, hubs, and seo.
      // Astro files (.astro) are excluded because coverage is measured from the
      // compiled TypeScript/React sources only.
      include: [
        "src/components/**/*.{ts,tsx}",
        "src/lib/**/*.ts",
        "src/hubs/**/*.ts",
        "src/seo/**/*.ts",
        "scripts/extract-toc.ts",
        "scripts/pdf-template.ts",
      ],
      exclude: [
        "src/pages/**",
        "src/lib/__mocks__/**",
        "src/lib/generate-theme-css.ts",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.astro",
        "scripts/**/*.test.ts",
        "scripts/generate-pdfs.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "astro:content": path.resolve(
        __dirname,
        "./src/lib/__mocks__/astro-content-stub.ts",
      ),
    },
  },
});

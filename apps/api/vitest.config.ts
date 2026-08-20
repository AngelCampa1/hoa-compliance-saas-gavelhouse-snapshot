import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    setupFiles: ["./__tests__/setup.ts"],
    // forks pool avoids a Windows race condition where the coverage .tmp
    // directory is deleted between worker spawns when using the default
    // threads pool, causing ENOENT errors on the first coverage write.
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // Schema files contain only declarative Drizzle table definitions.
      // The reference callbacks are invoked by Drizzle internally at query
      // time, not during module initialisation, so V8 cannot reach them via
      // test imports. Excluding them avoids false negatives.
      // The scheduled wiring file is exercised only via Workers runtime —
      // unit-testing the cron handler directly is covered separately.
      exclude: ["src/db/schema/**", "src/scheduled.ts"],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});

import { describe, it, expect } from "vitest";
import {
  COVERED_WORKSPACES,
  README_END,
  README_START,
  SOURCE_HISTORY_PATH,
  collectApi,
  collectCoverageThreshold,
  collectGit,
  collectLoc,
  collectMetrics,
  collectSchema,
  collectTests,
  countLines,
  formatNumber,
  parseShortlog,
  renderMetricsDoc,
  renderReadmeBlock,
  replaceReadmeBlock,
  toLines,
  type Metrics,
  type MetricsDeps,
} from "./metrics.js";

const VITEST_CONFIG = `
  export default defineConfig({
    test: {
      coverage: {
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
`;

interface StubOptions {
  files?: Record<string, string[]>;
  contents?: Record<string, string>;
  commits?: string;
  dates?: string;
  shortlog?: string;
  endpoints?: number;
}

function makeDeps(options: StubOptions = {}): MetricsDeps {
  const files = options.files ?? {};
  const contents = options.contents ?? {};

  return {
    run: (command, args) => {
      expect(command).toBe("git");
      const [subcommand] = args;
      if (subcommand === "ls-files") {
        const patterns = args.slice(2);
        const key = patterns.join(",");
        return (files[key] ?? []).join("\n");
      }
      if (subcommand === "rev-list") return options.commits ?? "670";
      if (subcommand === "log")
        return options.dates ?? "2026-06-17\n2026-04-14";
      if (subcommand === "shortlog") return options.shortlog ?? "";
      throw new Error(`unexpected git subcommand: ${String(subcommand)}`);
    },
    readFile: (relativePath) => contents[relativePath] ?? null,
    countEndpoints: () => Promise.resolve(options.endpoints ?? 107),
  };
}

function coverageContents(): Record<string, string> {
  return Object.fromEntries(
    COVERED_WORKSPACES.map((workspace) => [
      `${workspace}/vitest.config.ts`,
      VITEST_CONFIG,
    ]),
  );
}

describe("toLines", () => {
  it("trims and drops empty lines", () => {
    expect(toLines("  a  \r\n\n b \n")).toEqual(["a", "b"]);
  });

  it("returns nothing for empty output", () => {
    expect(toLines("")).toEqual([]);
  });
});

describe("countLines", () => {
  it("counts a trailing newline as a terminator, not a new line", () => {
    expect(countLines("a\nb\n")).toBe(2);
  });

  it("counts a trailing partial line", () => {
    expect(countLines("a\nb")).toBe(2);
  });

  it("returns zero for an empty file", () => {
    expect(countLines("")).toBe(0);
  });
});

describe("collectLoc", () => {
  it("sums files and lines per extension", () => {
    const deps = makeDeps({
      files: { "*.ts": ["a.ts", "b.ts"], "*.tsx": ["c.tsx"] },
      contents: { "a.ts": "one\ntwo\n", "b.ts": "x\n", "c.tsx": "y\nz\n" },
    });

    const loc = collectLoc(deps);

    expect(loc.files).toBe(3);
    expect(loc.lines).toBe(5);
    expect(loc.byExtension).toContainEqual({
      extension: "ts",
      files: 2,
      lines: 3,
    });
  });

  it("skips files that cannot be read", () => {
    const deps = makeDeps({ files: { "*.ts": ["gone.ts"] } });
    expect(collectLoc(deps).lines).toBe(0);
  });
});

describe("parseShortlog", () => {
  it("merges display-name variants sharing an email and sorts by volume", () => {
    const parsed = parseShortlog(
      [
        "   528\tAngel Campa <angel@example.com>",
        "   121\tTest <test@example.com>",
        "    21\tPriorOrgName <angel@example.com>",
      ].join("\n"),
    );

    expect(parsed).toEqual([
      { email: "angel@example.com", commits: 549 },
      { email: "test@example.com", commits: 121 },
    ]);
  });

  it("ignores lines that do not match the expected shape", () => {
    expect(parseShortlog("garbage")).toEqual([]);
  });
});

describe("collectGit", () => {
  it("reads commit count and the first and last commit dates", () => {
    const git = collectGit(
      makeDeps({
        commits: "670",
        dates: "2026-06-17\n2026-05-01\n2026-04-14",
        shortlog: "  5\tA <a@example.com>",
      }),
    );

    expect(git).toEqual({
      commits: 670,
      firstCommit: "2026-04-14",
      lastCommit: "2026-06-17",
      authors: [{ email: "a@example.com", commits: 5 }],
    });
  });

  it("falls back to zero and empty dates when there is no history", () => {
    const git = collectGit(makeDeps({ commits: "", dates: "" }));
    expect(git.commits).toBe(0);
    expect(git.firstCommit).toBe("");
    expect(git.lastCommit).toBe("");
  });

  it("prefers history recorded by a snapshot export over live git", () => {
    const git = collectGit(
      makeDeps({
        commits: "1",
        dates: "2026-08-07",
        shortlog: "  1\tSnapshot <snap@example.com>",
        contents: {
          [SOURCE_HISTORY_PATH]: JSON.stringify({
            commits: 671,
            firstCommit: "2026-04-14",
            lastCommit: "2026-06-17",
            authors: [{ email: "a@example.com", commits: 671 }],
            sourceCommit: "5772dcc9",
          }),
        },
      }),
    );

    expect(git).toEqual({
      commits: 671,
      firstCommit: "2026-04-14",
      lastCommit: "2026-06-17",
      authors: [{ email: "a@example.com", commits: 671 }],
    });
  });

  it("falls back to live git when the recorded history is unusable", () => {
    // Each of these must fall back rather than throw: a corrupt provenance file
    // should not break `verify` for someone who just cloned the repository.
    const unusable = [
      "{ not json",
      "null",
      '"a string"',
      JSON.stringify({ commits: "671" }),
      JSON.stringify({
        commits: 671,
        firstCommit: "2026-04-14",
        lastCommit: "2026-06-17",
        authors: "nope",
      }),
      JSON.stringify({
        commits: 671,
        firstCommit: "2026-04-14",
        lastCommit: "2026-06-17",
        authors: [{ email: "a@example.com" }],
      }),
    ];

    for (const raw of unusable) {
      const git = collectGit(
        makeDeps({
          commits: "670",
          dates: "2026-06-17\n2026-04-14",
          shortlog: "  5\tA <a@example.com>",
          contents: { [SOURCE_HISTORY_PATH]: raw },
        }),
      );
      expect(git.commits).toBe(670);
      expect(git.firstCommit).toBe("2026-04-14");
    }
  });
});

describe("collectTests", () => {
  it("counts files and it/test call sites", () => {
    const deps = makeDeps({
      files: {
        "*.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx": ["a.test.ts", "b.test.ts"],
      },
      contents: {
        "a.test.ts": "it('x', () => {});\ntest('y', () => {});",
        "b.test.ts": "it.each([1])('z', () => {});",
      },
    });

    expect(collectTests(deps)).toEqual({ files: 2, cases: 3 });
  });

  it("skips unreadable files and files with no cases", () => {
    const deps = makeDeps({
      files: { "*.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx": ["a.ts", "b.ts"] },
      contents: { "b.ts": "const noTests = 1;" },
    });
    expect(collectTests(deps).cases).toBe(0);
  });
});

describe("collectSchema", () => {
  it("counts pgTable declarations and migrations separately per database", () => {
    const deps = makeDeps({
      files: {
        "apps/api/src/db/schema/*.ts": ["s.ts"],
        "apps/api/migrations/*.sql": ["0000.sql", "0001.sql"],
        "apps/api/d1-migrations/*.sql": ["0000.sql"],
      },
      contents: {
        "s.ts":
          "export const a = pgTable('a', {});\nexport const b = pgTable('b', {});",
      },
    });

    expect(collectSchema(deps)).toEqual({
      tables: 2,
      migrations: 2,
      d1Migrations: 1,
    });
  });

  it("skips unreadable schema files and files declaring no tables", () => {
    const deps = makeDeps({
      files: { "apps/api/src/db/schema/*.ts": ["missing.ts", "types.ts"] },
      contents: { "types.ts": "export type Fund = 'operating' | 'reserve';" },
    });
    expect(collectSchema(deps).tables).toBe(0);
  });
});

describe("collectApi", () => {
  it("excludes barrel files and takes the endpoint count from Hono", async () => {
    const deps = makeDeps({
      files: {
        "apps/api/src/routes/*.ts": [
          "apps/api/src/routes/health.ts",
          "apps/api/src/routes/bank/index.ts",
          "apps/api/src/routes/bank/reconcile.ts",
        ],
      },
      endpoints: 107,
    });

    expect(await collectApi(deps)).toEqual({ routeFiles: 2, endpoints: 107 });
  });
});

describe("collectCoverageThreshold", () => {
  it("returns the threshold when every workspace declares it", () => {
    const deps = makeDeps({ contents: coverageContents() });
    expect(collectCoverageThreshold(deps)).toBe(95);
  });

  it("throws when a workspace config is missing", () => {
    const contents = coverageContents();
    delete contents["scripts/vitest.config.ts"];
    expect(() => collectCoverageThreshold(makeDeps({ contents }))).toThrow(
      /Missing scripts\/vitest\.config\.ts/,
    );
  });

  it("throws when a workspace drops per-file enforcement", () => {
    const contents = coverageContents();
    contents["apps/api/vitest.config.ts"] = VITEST_CONFIG.replace(
      "perFile: true",
      "perFile: false",
    );
    expect(() => collectCoverageThreshold(makeDeps({ contents }))).toThrow(
      /does not enforce per-file coverage/,
    );
  });

  it("throws when a workspace lowers a metric threshold", () => {
    const contents = coverageContents();
    contents["apps/web/vitest.config.ts"] = VITEST_CONFIG.replace(
      "branches: 95",
      "branches: 80",
    );
    expect(() => collectCoverageThreshold(makeDeps({ contents }))).toThrow(
      /does not enforce branches coverage at 95%/,
    );
  });
});

describe("collectMetrics", () => {
  it("gathers every section", async () => {
    const deps = makeDeps({ contents: coverageContents() });
    const metrics = await collectMetrics(deps);

    expect(metrics.coverageThreshold).toBe(95);
    expect(metrics.coveredWorkspaces).toBe(COVERED_WORKSPACES.length);
    expect(metrics.api.endpoints).toBe(107);
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(100444)).toBe("100,444");
  });
});

function sampleMetrics(): Metrics {
  return {
    loc: {
      files: 960,
      lines: 100444,
      byExtension: [
        { extension: "ts", files: 500, lines: 60000 },
        { extension: "sql", files: 0, lines: 0 },
      ],
    },
    git: {
      commits: 670,
      firstCommit: "2026-04-14",
      lastCommit: "2026-06-17",
      authors: [{ email: "a@example.com", commits: 549 }],
    },
    tests: { files: 410, cases: 6253 },
    schema: { tables: 42, migrations: 27, d1Migrations: 2 },
    api: { routeFiles: 39, endpoints: 107 },
    coverageThreshold: 95,
    coveredWorkspaces: 5,
  };
}

describe("renderReadmeBlock", () => {
  it("wraps the table in the marker comments", () => {
    const block = renderReadmeBlock(sampleMetrics());
    expect(block.startsWith(README_START)).toBe(true);
    expect(block.trimEnd().endsWith(README_END)).toBe(true);
    expect(block).toContain("100,444 lines across 960 files");
    expect(block).toContain("107 endpoints across 39 route files");
  });
});

describe("renderMetricsDoc", () => {
  it("includes methodology and omits extensions with no files", () => {
    const doc = renderMetricsDoc(sampleMetrics());
    expect(doc).toContain("| `.ts` | 500 | 60,000 |");
    expect(doc).not.toContain("`.sql`");
    expect(doc).toContain("a@example.com");
    expect(doc).toContain("Hono's own route table");
  });
});

describe("replaceReadmeBlock", () => {
  it("replaces only the generated block", () => {
    const readme = `before\n${README_START}\nold\n${README_END}\nafter`;
    const result = replaceReadmeBlock(
      readme,
      `${README_START}\nnew\n${README_END}`,
    );
    expect(result).toBe(`before\n${README_START}\nnew\n${README_END}\nafter`);
  });

  it("throws when the markers are absent", () => {
    expect(() => replaceReadmeBlock("no markers", "x")).toThrow(/markers/);
  });
});

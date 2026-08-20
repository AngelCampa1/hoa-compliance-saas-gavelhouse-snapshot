/**
 * Stress / adversarial fuzz tests for postEntry domain logic.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Strategy:
 * - Seeded PRNG (mulberry32) for deterministic reproduction.
 * - Thousands of generated balanced/unbalanced/adversarial inputs.
 * - Property assertions, not just example assertions.
 */

import { describe, it, expect } from "vitest";
import {
  postEntry,
  CommingleError,
} from "../../src/domain/accounting/postEntry.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Mock DB builder (mirrors postEntry.test.ts pattern)
// ---------------------------------------------------------------------------
type MockAccount = {
  id: string;
  communityId: string;
  fundType: "operating" | "reserve";
  name: string;
  code: string;
  accountType: string;
  active: boolean;
};

function makeMockDb(accounts: MockAccount[]) {
  const insertedEntries: unknown[] = [];
  const insertedLines: unknown[] = [];

  let pendingAccounts = [...accounts];

  const makeTx = () => ({
    insert: (_table: unknown) => ({
      values: (row: unknown) => {
        const r = row as Record<string, unknown>;
        if ("memo" in r) insertedEntries.push(row);
        else insertedLines.push(row);
        return Promise.resolve(undefined);
      },
    }),
  });

  const mockSelect = () => ({
    from: () => ({
      where: () => ({
        limit: (_n: number) => {
          const next = pendingAccounts.shift();
          return Promise.resolve(next ? [next] : []);
        },
      }),
    }),
  });

  return {
    select: mockSelect,
    insert: (_table: unknown) => ({
      values: (row: unknown) => {
        const r = row as Record<string, unknown>;
        if ("memo" in r) insertedEntries.push(row);
        else insertedLines.push(row);
        return Promise.resolve(undefined);
      },
    }),
    transaction: async (
      fn: (tx: ReturnType<typeof makeTx>) => Promise<void>,
    ) => {
      await fn(makeTx());
    },
    _insertedEntries: insertedEntries,
    _insertedLines: insertedLines,
    _resetPending: (accts: MockAccount[]) => {
      pendingAccounts = [...accts];
    },
  };
}

type MockDb = ReturnType<typeof makeMockDb>;

function asDb(db: MockDb) {
  return db as unknown as Parameters<typeof postEntry>[0];
}

// ---------------------------------------------------------------------------
// Account fixtures
// ---------------------------------------------------------------------------
function opAccount(idx: number): MockAccount {
  return {
    id: `op-acc-${idx}`,
    communityId: "comm-1",
    fundType: "operating",
    name: `Op Account ${idx}`,
    code: `${1000 + idx}`,
    accountType: "asset",
    active: true,
  };
}
function resAccount(idx: number): MockAccount {
  return {
    id: `res-acc-${idx}`,
    communityId: "comm-1",
    fundType: "reserve",
    name: `Res Account ${idx}`,
    code: `${1500 + idx}`,
    accountType: "asset",
    active: true,
  };
}

const BASE_INPUT = {
  communityId: "comm-1",
  createdByUserId: "user-1",
  entryDate: "2024-06-01",
  memo: "fuzz test",
};

// ---------------------------------------------------------------------------
// PROPERTY 1: CommingleError fires whenever per-fund debit != credit
// (fuzz 5 000 balanced-per-total-but-cross-fund inputs)
// ---------------------------------------------------------------------------
describe("postEntry — commingling invariant (fuzz)", () => {
  const rng = mulberry32(0xdeadbeef);

  it("always throws CommingleError when operating-only debit != credit", async () => {
    // 200 iterations: random amounts where op-debit != op-credit
    const runs = 200;
    let caught = 0;
    for (let i = 0; i < runs; i++) {
      const debit = Math.floor(rng() * 100_000) + 1;
      const credit = debit + Math.floor(rng() * 999) + 1; // credit > debit always
      const db = makeMockDb([opAccount(i * 2), opAccount(i * 2 + 1)]);
      try {
        await postEntry(asDb(db), {
          ...BASE_INPUT,
          lines: [
            { accountId: `op-acc-${i * 2}`, debitCents: debit, creditCents: 0 },
            {
              accountId: `op-acc-${i * 2 + 1}`,
              debitCents: 0,
              creditCents: credit,
            },
          ],
        });
      } catch (err) {
        if (err instanceof CommingleError) caught++;
      }
    }
    expect(caught).toBe(runs);
  });

  it("always throws CommingleError for cross-fund (op debit, res credit)", async () => {
    const runs = 200;
    let caught = 0;
    for (let i = 0; i < runs; i++) {
      const amount = Math.floor(rng() * 100_000) + 1;
      const db = makeMockDb([opAccount(i), resAccount(i)]);
      try {
        await postEntry(asDb(db), {
          ...BASE_INPUT,
          lines: [
            { accountId: `op-acc-${i}`, debitCents: amount, creditCents: 0 },
            { accountId: `res-acc-${i}`, debitCents: 0, creditCents: amount },
          ],
        });
      } catch (err) {
        if (err instanceof CommingleError) caught++;
      }
    }
    expect(caught).toBe(runs);
  });

  it("accepts entries where both funds independently balance", async () => {
    const runs = 200;
    let accepted = 0;
    for (let i = 0; i < runs; i++) {
      const opAmt = Math.floor(rng() * 50_000) + 1;
      const resAmt = Math.floor(rng() * 50_000) + 1;
      const db = makeMockDb([
        opAccount(i * 4),
        opAccount(i * 4 + 1),
        resAccount(i * 4 + 2),
        resAccount(i * 4 + 3),
      ]);
      try {
        await postEntry(asDb(db), {
          ...BASE_INPUT,
          lines: [
            { accountId: `op-acc-${i * 4}`, debitCents: opAmt, creditCents: 0 },
            {
              accountId: `op-acc-${i * 4 + 1}`,
              debitCents: 0,
              creditCents: opAmt,
            },
            {
              accountId: `res-acc-${i * 4 + 2}`,
              debitCents: resAmt,
              creditCents: 0,
            },
            {
              accountId: `res-acc-${i * 4 + 3}`,
              debitCents: 0,
              creditCents: resAmt,
            },
          ],
        });
        accepted++;
      } catch {
        // should not throw
      }
    }
    expect(accepted).toBe(runs);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 2: line validation — each line must have exactly one side > 0
// ---------------------------------------------------------------------------
describe("postEntry — line validation edge cases", () => {
  it("rejects lines where both debit and credit are 0", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow("exactly one");
  });

  it("rejects lines where both debit and credit are positive", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 500, creditCents: 500 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow("exactly one");
  });

  // BUG: The line validation uses `> 0` so negative values pass BOTH checks as
  // false, satisfying hasDebit===hasCredit (false===false) and THROWING "exactly
  // one". So a negative debit or credit is correctly REJECTED by the line check.
  // This is the expected behavior — verify it.
  it("rejects a line with negative debitCents (caught by non-negative integer guard)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: -1000, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 1000 },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });

  it("rejects a line with negative creditCents (caught by non-negative integer guard)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: -1000 },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });

  // After FIX A: the non-negative integer guard runs before the >0 check,
  // so negative creditCents on a debit-side line is now caught immediately.
  it("negative creditCents on a debit-side line is now rejected by integer guard", async () => {
    // line1: debitCents=1000, creditCents=-1000
    // The new guard catches creditCents=-1000 before the >0 check.
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 1000, creditCents: -1000 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 2000 },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 3: NaN / Infinity / float inputs
// ---------------------------------------------------------------------------
describe("postEntry — NaN / Infinity / float robustness", () => {
  // NaN: Number.isInteger(NaN) is false → caught by non-negative integer guard
  it("rejects NaN debitCents (caught by non-negative integer guard)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: NaN, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 1000 },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });

  it("rejects NaN creditCents (caught by non-negative integer guard)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: NaN },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });

  // After FIX A: Number.isInteger(Infinity) is false, so the guard rejects it.
  it("Infinity debitCents is now rejected by non-negative integer guard", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: Infinity, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: Infinity },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });

  // After FIX A: Number.isInteger(100.5) is false, so the guard rejects it.
  it("float debitCents (e.g. 100.5) is now rejected by non-negative integer guard", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 100.5, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 100.5 },
        ],
      }),
    ).rejects.toThrow("non-negative integer cent amount");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4: Large sums / integer overflow near MAX_SAFE_INTEGER
// ---------------------------------------------------------------------------
describe("postEntry — large sums / integer overflow", () => {
  const MAX = Number.MAX_SAFE_INTEGER; // 9007199254740991

  // MAX_SAFE_INTEGER is a safe integer and balances when both sides match, but
  // it is far above the int32 width of the journal_lines columns. Posting it
  // would overflow the column at INSERT (22003), so the int32 guard rejects it
  // before it can reach the database.
  it("rejects MAX_SAFE_INTEGER amounts (above int32, would overflow column)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: MAX, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: MAX },
        ],
      }),
    ).rejects.toThrow(/within int32 range/);
  });

  // Boundary: exactly INT32_MAX fits the column and must be accepted.
  it("accepts amounts at exactly INT32_MAX (column boundary)", async () => {
    const INT32_MAX = 2147483647;
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    const result = await postEntry(asDb(db), {
      ...BASE_INPUT,
      lines: [
        { accountId: "op-acc-0", debitCents: INT32_MAX, creditCents: 0 },
        { accountId: "op-acc-1", debitCents: 0, creditCents: INT32_MAX },
      ],
    });
    expect(result.lineCount).toBe(2);
  });

  // Just past the boundary: INT32_MAX + 1 is a safe integer but overflows.
  it("rejects amounts at INT32_MAX + 1 (just past column boundary)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 2147483648, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 2147483648 },
        ],
      }),
    ).rejects.toThrow(/within int32 range/);
  });

  // FIX R3: postEntry now guards with Number.isSafeInteger, so any amount above
  // MAX_SAFE_INTEGER (where integer arithmetic loses precision) is rejected
  // before it can corrupt the per-fund balance comparison or the ledger.
  it("rejects amounts above MAX_SAFE_INTEGER (unsafe-integer guard)", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    const UNSAFE = MAX + 1; // 2^53 — not a safe integer
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: UNSAFE, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: UNSAFE },
        ],
      }),
    ).rejects.toThrow(/non-negative integer cent amount/);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 5: Zero-amount entries (both sides 0 via a specific composition)
// ---------------------------------------------------------------------------
describe("postEntry — zero amounts", () => {
  it("rejects a line where debitCents=0 and creditCents=0", async () => {
    const db = makeMockDb([opAccount(0), opAccount(1)]);
    await expect(
      postEntry(asDb(db), {
        ...BASE_INPUT,
        lines: [
          { accountId: "op-acc-0", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-1", debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow("exactly one");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 6: Fuzz balanced multi-line entries — no false CommingleErrors
// ---------------------------------------------------------------------------
describe("postEntry — fuzz balanced entries never false-CommingleError", () => {
  const rng = mulberry32(0xcafebabe);

  it("never throws CommingleError for genuinely balanced entries (1000 runs)", async () => {
    let falsePositives = 0;
    const RUNS = 1000;

    for (let i = 0; i < RUNS; i++) {
      const n = Math.floor(rng() * 4) + 1; // 1..4 debit lines
      const totalDebit = Math.floor(rng() * 100_000) + 100;

      // Build n debit lines that sum exactly to totalDebit
      const debits: number[] = [];
      let remaining = totalDebit;
      for (let j = 0; j < n - 1; j++) {
        const d = Math.floor(rng() * (remaining - (n - j - 1))) + 1;
        debits.push(d);
        remaining -= d;
      }
      debits.push(remaining);

      const m = Math.floor(rng() * 4) + 1; // 1..4 credit lines
      const credits: number[] = [];
      let remCredit = totalDebit;
      for (let j = 0; j < m - 1; j++) {
        const c = Math.floor(rng() * (remCredit - (m - j - 1))) + 1;
        credits.push(c);
        remCredit -= c;
      }
      credits.push(remCredit);

      const numAccounts = debits.length + credits.length;
      const accts = Array.from({ length: numAccounts }, (_, k) =>
        opAccount(i * 20 + k),
      );
      const db = makeMockDb(accts);

      const lines = [
        ...debits.map((d, j) => ({
          accountId: `op-acc-${i * 20 + j}`,
          debitCents: d,
          creditCents: 0,
        })),
        ...credits.map((c, j) => ({
          accountId: `op-acc-${i * 20 + debits.length + j}`,
          debitCents: 0,
          creditCents: c,
        })),
      ];

      try {
        await postEntry(asDb(db), { ...BASE_INPUT, lines });
      } catch (err) {
        if (err instanceof CommingleError) {
          falsePositives++;
        }
      }
    }
    expect(falsePositives).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 7: Fuzz unbalanced entries — CommingleError always fires
// ---------------------------------------------------------------------------
describe("postEntry — fuzz unbalanced entries always CommingleError", () => {
  const rng = mulberry32(0xbaddeed);

  it("always throws CommingleError for unbalanced entries (1000 runs)", async () => {
    let missed = 0;
    const RUNS = 1000;

    for (let i = 0; i < RUNS; i++) {
      const debit = Math.floor(rng() * 100_000) + 1;
      // credit != debit, offset by 1..100
      const offset = Math.floor(rng() * 100) + 1;
      const credit = debit + offset;

      const db = makeMockDb([opAccount(i * 2), opAccount(i * 2 + 1)]);
      try {
        await postEntry(asDb(db), {
          ...BASE_INPUT,
          lines: [
            { accountId: `op-acc-${i * 2}`, debitCents: debit, creditCents: 0 },
            {
              accountId: `op-acc-${i * 2 + 1}`,
              debitCents: 0,
              creditCents: credit,
            },
          ],
        });
        missed++; // should have thrown
      } catch (err) {
        if (!(err instanceof CommingleError)) {
          missed++; // wrong error type
        }
      }
    }
    expect(missed).toBe(0);
  });
});

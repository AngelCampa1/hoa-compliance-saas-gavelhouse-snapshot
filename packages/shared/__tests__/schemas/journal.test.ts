import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  journalLineInput,
  createJournalEntryInput,
} from "../../src/schemas/journal.js";

describe("journalLineInput", () => {
  it("accepts a valid debit line", () => {
    const result = journalLineInput.parse({
      accountId: "acc-1",
      debitCents: 1000,
      creditCents: 0,
    });
    expect(result.accountId).toBe("acc-1");
    expect(result.debitCents).toBe(1000);
    expect(result.creditCents).toBe(0);
  });

  it("accepts a valid credit line", () => {
    const result = journalLineInput.parse({
      accountId: "acc-2",
      debitCents: 0,
      creditCents: 500,
    });
    expect(result.creditCents).toBe(500);
  });

  it("accepts a line with both zero", () => {
    // Zod schema allows both zero — business logic rejects this later
    const result = journalLineInput.parse({
      accountId: "acc-1",
      debitCents: 0,
      creditCents: 0,
    });
    expect(result.debitCents).toBe(0);
    expect(result.creditCents).toBe(0);
  });

  it("rejects empty accountId", () => {
    expect(() =>
      journalLineInput.parse({
        accountId: "",
        debitCents: 100,
        creditCents: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects negative debitCents", () => {
    expect(() =>
      journalLineInput.parse({
        accountId: "acc-1",
        debitCents: -1,
        creditCents: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects negative creditCents", () => {
    expect(() =>
      journalLineInput.parse({
        accountId: "acc-1",
        debitCents: 0,
        creditCents: -5,
      }),
    ).toThrow(ZodError);
  });

  it("rejects non-integer debitCents", () => {
    expect(() =>
      journalLineInput.parse({
        accountId: "acc-1",
        debitCents: 1.5,
        creditCents: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing accountId", () => {
    expect(() =>
      journalLineInput.parse({ debitCents: 100, creditCents: 0 }),
    ).toThrow(ZodError);
  });
});

describe("createJournalEntryInput", () => {
  const validEntry = {
    communityId: "comm-1",
    entryDate: "2024-01-15",
    memo: "Monthly assessment",
    lines: [
      { accountId: "acc-1", debitCents: 1000, creditCents: 0 },
      { accountId: "acc-2", debitCents: 0, creditCents: 1000 },
    ],
  };

  it("accepts a valid entry with 2 lines", () => {
    const result = createJournalEntryInput.parse(validEntry);
    expect(result.communityId).toBe("comm-1");
    expect(result.entryDate).toBe("2024-01-15");
    expect(result.memo).toBe("Monthly assessment");
    expect(result.lines).toHaveLength(2);
  });

  it("accepts an entry with more than 2 lines", () => {
    const result = createJournalEntryInput.parse({
      ...validEntry,
      lines: [
        { accountId: "acc-1", debitCents: 500, creditCents: 0 },
        { accountId: "acc-2", debitCents: 500, creditCents: 0 },
        { accountId: "acc-3", debitCents: 0, creditCents: 1000 },
      ],
    });
    expect(result.lines).toHaveLength(3);
  });

  it("rejects missing communityId", () => {
    const { communityId: _c, ...rest } = validEntry;
    expect(() => createJournalEntryInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects empty communityId", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, communityId: "" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid date format — no separators", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, entryDate: "20240115" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid date format — wrong order", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, entryDate: "15-01-2024" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid date format — partial", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, entryDate: "2024-01" }),
    ).toThrow(ZodError);
  });

  it("rejects empty memo", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, memo: "" }),
    ).toThrow(ZodError);
  });

  it("rejects memo over 500 chars", () => {
    expect(() =>
      createJournalEntryInput.parse({
        ...validEntry,
        memo: "a".repeat(501),
      }),
    ).toThrow(ZodError);
  });

  it("accepts memo of exactly 500 chars", () => {
    const result = createJournalEntryInput.parse({
      ...validEntry,
      memo: "a".repeat(500),
    });
    expect(result.memo.length).toBe(500);
  });

  it("rejects fewer than 2 lines", () => {
    expect(() =>
      createJournalEntryInput.parse({
        ...validEntry,
        lines: [{ accountId: "acc-1", debitCents: 1000, creditCents: 0 }],
      }),
    ).toThrow(ZodError);
  });

  it("rejects empty lines array", () => {
    expect(() =>
      createJournalEntryInput.parse({ ...validEntry, lines: [] }),
    ).toThrow(ZodError);
  });

  it("rejects lines with negative cents", () => {
    expect(() =>
      createJournalEntryInput.parse({
        ...validEntry,
        lines: [
          { accountId: "acc-1", debitCents: -100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing entryDate", () => {
    const { entryDate: _d, ...rest } = validEntry;
    expect(() => createJournalEntryInput.parse(rest)).toThrow(ZodError);
  });
});

// INT32 overflow guard tests
describe("int32 overflow guard — journal schemas", () => {
  const INT32_MAX = 2147483647;

  it("rejects journalLineInput.debitCents above INT32_MAX", () => {
    const result = journalLineInput.safeParse({
      accountId: "acc-1",
      debitCents: INT32_MAX + 1,
      creditCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects journalLineInput.creditCents above INT32_MAX", () => {
    const result = journalLineInput.safeParse({
      accountId: "acc-1",
      debitCents: 0,
      creditCents: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });
});

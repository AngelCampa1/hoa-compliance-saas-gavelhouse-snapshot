import { eq, and } from "drizzle-orm";
import { INT32_MAX } from "@boardstack/shared";
import type { Db } from "../../db/client.js";
import { accounts } from "../../db/schema/accounts.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import { nanoid } from "../../lib/nanoid.js";

export class CommingleError extends Error {
  name = "CommingleError";
}

interface PostEntryLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

export interface PostEntryInput {
  communityId: string;
  createdByUserId: string | null;
  entryDate: string;
  memo: string;
  lines: PostEntryLine[];
}

type PostEntryDb = Pick<Db, "select" | "insert"> &
  Partial<Pick<Db, "transaction">>;

export async function postEntry(
  db: PostEntryDb,
  input: PostEntryInput,
): Promise<{ entryId: string; lineCount: number }> {
  // 1. Validate minimum 2 lines
  if (input.lines.length < 2) {
    throw new Error("Journal entry must have at least 2 lines");
  }

  // 2. Validate each line: both fields must be non-negative integers within
  //    the int32 width of the journal_lines columns (values above INT32_MAX
  //    would otherwise pass the safe-integer check yet overflow the column at
  //    INSERT, surfacing as an unhandled 22003 rather than a clean error),
  //    then exactly one of debit or credit must be > 0.
  for (const line of input.lines) {
    for (const [field, value] of [
      ["debitCents", line.debitCents],
      ["creditCents", line.creditCents],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0 || value > INT32_MAX) {
        throw new Error(
          `Journal line ${field} must be a non-negative integer cent amount within int32 range`,
        );
      }
    }
    const hasDebit = line.debitCents > 0;
    const hasCredit = line.creditCents > 0;
    if (hasDebit === hasCredit) {
      throw new Error(
        "Each journal line must have exactly one of debitCents or creditCents > 0",
      );
    }
  }

  // 3. Load each account by accountId WHERE communityId = input.communityId
  const resolvedLines: Array<
    PostEntryLine & { fundType: "operating" | "reserve" }
  > = [];

  for (const line of input.lines) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, line.accountId),
          eq(accounts.communityId, input.communityId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new Error(`Account not found in this community: ${line.accountId}`);
    }

    // 4. Copy fundType from loaded account
    resolvedLines.push({ ...line, fundType: account.fundType });
  }

  // 5. Per-fund balance invariant
  let opDebit = 0;
  let opCredit = 0;
  let resDebit = 0;
  let resCredit = 0;

  for (const line of resolvedLines) {
    if (line.fundType === "operating") {
      opDebit += line.debitCents;
      opCredit += line.creditCents;
    } else {
      resDebit += line.debitCents;
      resCredit += line.creditCents;
    }
  }

  const opBalanced = opDebit === opCredit;
  const resBalanced = resDebit === resCredit;

  if (!opBalanced || !resBalanced) {
    throw new CommingleError(
      `Operating and reserve funds must balance independently. Entry rejected to prevent commingling. Operating: debit ${opDebit} ≠ credit ${opCredit}. Reserve: debit ${resDebit} ≠ credit ${resCredit}.`,
    );
  }

  // 6. Persist in a transaction
  const entryId = nanoid();

  const persistEntry = async (target: Pick<Db, "insert">) => {
    await target.insert(journalEntries).values({
      id: entryId,
      communityId: input.communityId,
      entryDate: input.entryDate,
      memo: input.memo,
      createdByUserId: input.createdByUserId,
    });

    for (const line of resolvedLines) {
      await target.insert(journalLines).values({
        id: nanoid(),
        entryId,
        communityId: input.communityId,
        accountId: line.accountId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        fundType: line.fundType,
      });
    }
  };

  if (db.transaction) {
    await db.transaction(async (tx) => {
      await persistEntry(tx);
    });
  } else {
    await persistEntry(db);
  }

  // 7. Return
  return { entryId, lineCount: resolvedLines.length };
}

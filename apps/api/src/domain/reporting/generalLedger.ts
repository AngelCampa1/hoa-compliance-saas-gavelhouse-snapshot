import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { accounts } from "../../db/schema/accounts.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import type { Db } from "../../db/client.js";

export type LedgerRow = {
  entryId: string;
  entryDate: string;
  memo: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  fundType: "operating" | "reserve";
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
};

export async function generalLedger(
  db: Db,
  communityId: string,
  from: string,
  to: string,
  accountId?: string,
  fundType?: "operating" | "reserve",
  limit = 50,
  offset = 0,
): Promise<{ rows: LedgerRow[]; total: number }> {
  const conditions = [
    eq(journalLines.communityId, communityId), // MAJOR-2 guard
    eq(journalEntries.communityId, communityId),
    gte(journalEntries.entryDate, from),
    lte(journalEntries.entryDate, to),
  ];

  if (accountId !== undefined) {
    conditions.push(eq(journalLines.accountId, accountId));
  }

  if (fundType !== undefined) {
    conditions.push(eq(journalLines.fundType, fundType));
  }

  const countResult = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conditions));

  const total = countResult[0]?.total ?? 0;

  const rawRows = await db
    .select({
      entryId: journalLines.entryId,
      entryDate: journalEntries.entryDate,
      memo: journalEntries.memo,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      fundType: journalLines.fundType,
      debitCents: sql<number>`${journalLines.debitCents}`.mapWith(Number),
      creditCents: sql<number>`${journalLines.creditCents}`.mapWith(Number),
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conditions))
    // journalLines.entryId is the parent FK shared by every line of one entry,
    // so it cannot break ties between lines of the same entry. Append the line's
    // own PK as a stable tiebreaker so row order — and the per-row running
    // balance computed below — is deterministic across identical queries.
    .orderBy(
      asc(journalEntries.entryDate),
      asc(journalLines.entryId),
      asc(journalLines.id),
    )
    .limit(limit)
    .offset(offset);

  // Compute running balance in-process for the returned page.
  // Note: running balance is computed only over the current page; it does not
  // reflect entries on preceding pages. Use offset=0 to get a full ledger run.
  let runningBalance = 0;
  const rows = rawRows.map((row) => {
    runningBalance += row.debitCents - row.creditCents;
    return {
      entryId: row.entryId,
      entryDate: row.entryDate,
      memo: row.memo,
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      fundType: row.fundType as "operating" | "reserve",
      debitCents: row.debitCents,
      creditCents: row.creditCents,
      runningBalanceCents: runningBalance,
    };
  });

  return { rows, total };
}

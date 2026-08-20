import { and, eq, lte, sql } from "drizzle-orm";
import { accounts } from "../../db/schema/accounts.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import type { Db } from "../../db/client.js";
import type { TrialBalanceRow } from "@boardstack/shared";

export async function trialBalance(
  db: Db,
  communityId: string,
  asOf: string,
): Promise<TrialBalanceRow[]> {
  return db
    .select({
      accountId: accounts.id,
      accountCode: accounts.code,
      accountName: accounts.name,
      accountType: accounts.accountType,
      fundType: journalLines.fundType,
      debitCents:
        sql<number>`coalesce(sum(${journalLines.debitCents}), 0)`.mapWith(
          Number,
        ),
      creditCents:
        sql<number>`coalesce(sum(${journalLines.creditCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.communityId, communityId), // MAJOR-2 guard
        eq(journalEntries.communityId, communityId),
        lte(journalEntries.entryDate, asOf),
      ),
    )
    .groupBy(
      accounts.id,
      accounts.code,
      accounts.name,
      accounts.accountType,
      journalLines.fundType,
    )
    .orderBy(accounts.code);
}

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { accounts } from "../../db/schema/accounts.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import type { Db } from "../../db/client.js";

export type IncomeStatementLine = {
  fundType: "operating" | "reserve";
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "revenue" | "expense";
  amountCents: number;
};

export type IncomeStatement = {
  from: string;
  to: string;
  lines: IncomeStatementLine[];
  operatingRevenueCents: number;
  operatingExpenseCents: number;
  operatingNetCents: number;
  reserveRevenueCents: number;
  reserveExpenseCents: number;
  reserveNetCents: number;
};

export async function incomeStatement(
  db: Db,
  communityId: string,
  from: string,
  to: string,
): Promise<IncomeStatement> {
  const rawRows = await db
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
        gte(journalEntries.entryDate, from),
        lte(journalEntries.entryDate, to),
        inArray(accounts.accountType, ["revenue", "expense"]),
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

  const lines: IncomeStatementLine[] = rawRows
    .filter((r) => r.accountType === "revenue" || r.accountType === "expense")
    .map((r) => {
      const acType = r.accountType as "revenue" | "expense";
      const amountCents =
        acType === "revenue"
          ? r.creditCents - r.debitCents
          : r.debitCents - r.creditCents;
      return {
        fundType: r.fundType as "operating" | "reserve",
        accountId: r.accountId,
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: acType,
        amountCents,
      };
    });

  const operatingRevenueCents = lines
    .filter((l) => l.fundType === "operating" && l.accountType === "revenue")
    .reduce((sum, l) => sum + l.amountCents, 0);

  const operatingExpenseCents = lines
    .filter((l) => l.fundType === "operating" && l.accountType === "expense")
    .reduce((sum, l) => sum + l.amountCents, 0);

  const reserveRevenueCents = lines
    .filter((l) => l.fundType === "reserve" && l.accountType === "revenue")
    .reduce((sum, l) => sum + l.amountCents, 0);

  const reserveExpenseCents = lines
    .filter((l) => l.fundType === "reserve" && l.accountType === "expense")
    .reduce((sum, l) => sum + l.amountCents, 0);

  return {
    from,
    to,
    lines,
    operatingRevenueCents,
    operatingExpenseCents,
    operatingNetCents: operatingRevenueCents - operatingExpenseCents,
    reserveRevenueCents,
    reserveExpenseCents,
    reserveNetCents: reserveRevenueCents - reserveExpenseCents,
  };
}

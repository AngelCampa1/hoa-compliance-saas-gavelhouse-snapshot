import type { Db } from "../../db/client.js";
import { trialBalance } from "./trialBalance.js";

export type BalanceSheetSection = {
  fundType: "operating" | "reserve";
  accountType: "asset" | "liability" | "equity";
  accounts: {
    accountId: string;
    accountCode: string;
    accountName: string;
    balanceCents: number;
  }[];
  totalCents: number;
};

export type BalanceSheet = {
  asOf: string;
  sections: BalanceSheetSection[];
  operatingNetCents: number;
  reserveNetCents: number;
};

const BALANCE_SHEET_TYPES = new Set<string>(["asset", "liability", "equity"]);

function computeBalance(
  accountType: "asset" | "liability" | "equity",
  debitCents: number,
  creditCents: number,
): number {
  // Debit-normal: asset
  // Credit-normal: liability, equity
  if (accountType === "asset") {
    return debitCents - creditCents;
  }
  return creditCents - debitCents;
}

export async function balanceSheet(
  db: Db,
  communityId: string,
  asOf: string,
): Promise<BalanceSheet> {
  const rows = await trialBalance(db, communityId, asOf);

  // Only balance sheet account types
  const bsRows = rows.filter((r) => BALANCE_SHEET_TYPES.has(r.accountType));

  // Group by fundType + accountType
  const sectionMap = new Map<string, BalanceSheetSection>();

  for (const row of bsRows) {
    const acType = row.accountType as "asset" | "liability" | "equity";
    const key = `${row.fundType}::${acType}`;

    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        fundType: row.fundType as "operating" | "reserve",
        accountType: acType,
        accounts: [],
        totalCents: 0,
      });
    }

    const section = sectionMap.get(key)!;
    const balanceCents = computeBalance(
      acType,
      row.debitCents,
      row.creditCents,
    );

    section.accounts.push({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      balanceCents,
    });
    section.totalCents += balanceCents;
  }

  const sections = Array.from(sectionMap.values());

  // Compute net per fund: assets - liabilities - equity
  function fundNet(fundType: "operating" | "reserve"): number {
    const fundSections = sections.filter((s) => s.fundType === fundType);
    let net = 0;
    for (const s of fundSections) {
      if (s.accountType === "asset") {
        net += s.totalCents;
      } else {
        net -= s.totalCents;
      }
    }
    return net;
  }

  return {
    asOf,
    sections,
    operatingNetCents: fundNet("operating"),
    reserveNetCents: fundNet("reserve"),
  };
}

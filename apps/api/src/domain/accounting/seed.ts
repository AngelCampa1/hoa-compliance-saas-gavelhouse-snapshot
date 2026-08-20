import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { accounts } from "../../db/schema/accounts.js";
import { nanoid } from "../../lib/nanoid.js";

export type AccountSeed = {
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  fundType: "operating" | "reserve";
};

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  // Operating accounts (8)
  {
    code: "1000",
    name: "Operating Checking",
    accountType: "asset",
    fundType: "operating",
  },
  {
    code: "1100",
    name: "Operating Savings",
    accountType: "asset",
    fundType: "operating",
  },
  {
    code: "4000",
    name: "Assessment Revenue — Operating",
    accountType: "revenue",
    fundType: "operating",
  },
  {
    code: "5000",
    name: "Maintenance & Repairs",
    accountType: "expense",
    fundType: "operating",
  },
  {
    code: "5100",
    name: "Utilities",
    accountType: "expense",
    fundType: "operating",
  },
  {
    code: "5200",
    name: "Insurance — Operating",
    accountType: "expense",
    fundType: "operating",
  },
  {
    code: "5300",
    name: "Management & Admin",
    accountType: "expense",
    fundType: "operating",
  },
  {
    code: "2000",
    name: "Accounts Payable — Operating",
    accountType: "liability",
    fundType: "operating",
  },
  // Reserve accounts (6)
  {
    code: "1500",
    name: "Reserve Checking",
    accountType: "asset",
    fundType: "reserve",
  },
  {
    code: "1600",
    name: "Reserve Savings",
    accountType: "asset",
    fundType: "reserve",
  },
  {
    code: "4100",
    name: "Assessment Revenue — Reserve",
    accountType: "revenue",
    fundType: "reserve",
  },
  {
    code: "5500",
    name: "Reserve Contributions",
    accountType: "expense",
    fundType: "reserve",
  },
  {
    code: "5600",
    name: "Capital Projects",
    accountType: "expense",
    fundType: "reserve",
  },
  {
    code: "2100",
    name: "Accounts Payable — Reserve",
    accountType: "liability",
    fundType: "reserve",
  },
];

type AccountInsertDb = Pick<Db, "insert">;

export async function insertDefaultChartOfAccounts(
  db: AccountInsertDb,
  communityId: string,
  accountSeeds: AccountSeed[] = DEFAULT_ACCOUNTS,
): Promise<number> {
  for (const acct of accountSeeds) {
    await db.insert(accounts).values({
      id: nanoid(),
      communityId,
      ...acct,
    });
  }

  return accountSeeds.length;
}

export async function seedDefaultChartOfAccounts(
  db: Db,
  communityId: string,
): Promise<{ created: boolean; count: number }> {
  const existing = await db
    .select({ code: accounts.code })
    .from(accounts)
    .where(
      and(
        eq(accounts.communityId, communityId),
        inArray(
          accounts.code,
          DEFAULT_ACCOUNTS.map((account) => account.code),
        ),
      ),
    );

  const existingCodes = new Set(existing.map((account) => account.code));
  const missingAccounts = DEFAULT_ACCOUNTS.filter(
    (account) => !existingCodes.has(account.code),
  );

  if (missingAccounts.length === 0) {
    return { created: false, count: 0 };
  }

  const count = missingAccounts.length;

  try {
    await db.transaction(async (tx) => {
      await insertDefaultChartOfAccounts(tx, communityId, missingAccounts);
    });
  } catch (err) {
    // Postgres error code 23505 = unique_violation.
    // A concurrent request raced and seeded first — treat as a no-op (the
    // other process won and the accounts are present).
    const pgCode = (err as Record<string, unknown>)["code"];
    if (pgCode === "23505") {
      return { created: false, count: 0 };
    }
    throw err;
  }

  return { created: true, count };
}

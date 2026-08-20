/**
 * Demo seed script.
 *
 * Prerequisites: API running on http://localhost:8060 and Postgres at $DATABASE_URL.
 *
 * Builds a rich, realistic dataset so every dashboard screen has something to
 * show for portfolio screenshots:
 *
 *   - treasurer@test.gavelhouse.app (Scale tier)    — full rich dataset:
 *     16 units/homeowners, 6 months of dues + payments, a balanced multi-month
 *     general ledger (operating + reserve funds), a reserve study with a
 *     Fannie Mae compliance verdict, two bank statements + reconciliations
 *     (one finalized, one open with unmatched lines), violations, arch
 *     requests, meetings/motions/votes, and month-end closes.
 *   - portfolio@test.gavelhouse.app  (Portfolio tier) — owns a two-community
 *     portfolio with contrasting reserve-compliance numbers, for the
 *     portfolio rollup screen.
 *   - empty@test.gavelhouse.app      (default trial tier) — signed up and
 *     left completely untouched, so the app renders its real empty states.
 *
 * Idempotency: every row this script inserts uses a deterministic id and
 * every INSERT uses ON CONFLICT DO NOTHING, so re-running against an
 * already-seeded database is a safe no-op. Signup itself is skipped if the
 * email already exists (see signUp()).
 *
 * Accounting invariant (read before touching the journal-entry helper below):
 * Gavelhouse enforces that operating and reserve funds must each balance
 * INDEPENDENTLY within a single journal entry — see
 * apps/api/src/domain/accounting/postEntry.ts's CommingleError. This script
 * bypasses postEntry() (it writes directly to Postgres, per the "everything
 * after signup is a direct SQL insert" rule), so nothing in the database
 * stops a commingled entry from being written. postBalancedEntry() below is
 * the only place that is allowed to INSERT into journal_entries/journal_lines,
 * and it only ever pairs a debit account with a credit account that share the
 * same fundType — so every entry it writes trivially satisfies "operating
 * debits == operating credits AND reserve debits == reserve credits" (the
 * other fund's debit/credit totals are both zero). It also copies fundType
 * from the looked-up account rows rather than trusting the caller, mirroring
 * postEntry()'s behavior.
 */
import postgres from "postgres";
import { TRIAL_DURATION_DAYS } from "@boardstack/shared";
import { DEFAULT_ACCOUNTS } from "../src/domain/accounting/seed.js";

const API = process.env["API_URL"] ?? "http://localhost:8060";
const APP_ORIGIN = process.env["APP_URL"] ?? "http://localhost:3060";
const DB_URL =
  process.env["DATABASE_URL"] ??
  "postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev";

const PASSWORD = "Test1234!";

type Sql = ReturnType<typeof postgres>;
type Tier = "starter" | "growth" | "scale" | "portfolio";
type FundType = "operating" | "reserve";

interface DemoUser {
  name: string;
  email: string;
  tier: Tier | null; // null = leave at the default trial tier from signup
}

const USERS: DemoUser[] = [
  {
    name: "Treasurer Test",
    email: "treasurer@test.gavelhouse.app",
    tier: "scale",
  },
  {
    name: "Portfolio Test",
    email: "portfolio@test.gavelhouse.app",
    tier: "portfolio",
  },
  { name: "Empty Test", email: "empty@test.gavelhouse.app", tier: null },
];

async function signUp(user: DemoUser): Promise<{ created: boolean }> {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(APP_ORIGIN).origin,
    },
    body: JSON.stringify({
      name: user.name,
      email: user.email,
      password: PASSWORD,
    }),
  });
  if (res.ok) return { created: true };
  const body = await res.text();
  if (res.status >= 400 && res.status < 500) {
    if (/exists|already|registered|duplicate/i.test(body))
      return { created: false };
    console.warn(
      `  signup ${user.email} returned ${res.status}: ${body.slice(0, 200)}`,
    );
    return { created: false };
  }
  throw new Error(`Signup failed for ${user.email} (${res.status}): ${body}`);
}

const TIER_PRICE_ID: Record<Tier, string> = {
  starter: "price_starter",
  growth: "price_growth",
  scale: "price_scale",
  portfolio: "price_portfolio",
};

async function setTier(sql: Sql, email: string, tier: Tier): Promise<void> {
  const priceId = TIER_PRICE_ID[tier];
  await sql`
    UPDATE subscriptions
    SET tier = ${tier}, status = 'trialing', updated_at = NOW()
    WHERE community_id IN (
      SELECT cm.community_id
      FROM community_members cm
      JOIN "user" u ON u.id = cm.user_id
      WHERE u.email = ${email} AND cm.role = 'owner'
    )
  `;
  await sql`
    UPDATE communities
    SET stripe_price_id = ${priceId}, updated_at = NOW()
    WHERE id IN (
      SELECT cm.community_id
      FROM community_members cm
      JOIN "user" u ON u.id = cm.user_id
      WHERE u.email = ${email} AND cm.role = 'owner'
    )
  `;
}

async function getUserId(sql: Sql, email: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM "user" WHERE email = ${email} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`User not found: ${email}`);
  return row.id;
}

async function getOwnerCommunityId(sql: Sql, email: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT cm.community_id AS id
    FROM community_members cm
    JOIN "user" u ON u.id = cm.user_id
    WHERE u.email = ${email} AND cm.role = 'owner'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`Owner community not found for ${email}`);
  return row.id;
}

// The chart of accounts is imported, not restated. Duplicating it here would
// let the two copies drift, and a demo whose accounts disagree with the ones a
// real signup creates is worse than no demo. Only the insert is local: that
// module's insertDefaultChartOfAccounts() wants a Drizzle handle, and this
// script deliberately stays on raw SQL after signup. See the file header.

async function insertAccountsDirect(
  sql: Sql,
  communityId: string,
  idPrefix: string,
): Promise<void> {
  for (const acct of DEFAULT_ACCOUNTS) {
    await sql`
      INSERT INTO accounts (id, community_id, code, name, account_type, fund_type)
      VALUES (${`${idPrefix}-acct-${acct.code}`}, ${communityId}, ${acct.code}, ${acct.name}, ${acct.accountType}, ${acct.fundType})
      ON CONFLICT DO NOTHING
    `;
  }
}

interface AccountRef {
  id: string;
  fundType: FundType;
}

async function loadAccountsByCode(
  sql: Sql,
  communityId: string,
): Promise<Map<string, AccountRef>> {
  const rows = await sql<{ code: string; id: string; fund_type: FundType }[]>`
    SELECT id, code, fund_type FROM accounts WHERE community_id = ${communityId}
  `;
  const map = new Map<string, AccountRef>();
  for (const r of rows) map.set(r.code, { id: r.id, fundType: r.fund_type });
  return map;
}

async function balanceAsOf(
  sql: Sql,
  communityId: string,
  accountId: string,
  asOfDate: string,
): Promise<number> {
  const rows = await sql<{ balance: number }[]>`
    SELECT COALESCE(SUM(jl.debit_cents), 0) - COALESCE(SUM(jl.credit_cents), 0) AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ${accountId}
      AND je.community_id = ${communityId}
      AND je.entry_date <= ${asOfDate}
  `;
  return Number(rows[0]?.balance ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Balanced journal entry helper. See file header for the commingling
// invariant this must uphold. Both accounts of an entry must share a
// fundType — this helper refuses to post otherwise, and it writes the
// fundType it read from the `accounts` table onto each line rather than
// trusting the caller.
// ─────────────────────────────────────────────────────────────────────────
interface BalancedEntryInput {
  id: string;
  debitAccountCode: string;
  creditAccountCode: string;
  amountCents: number;
  fundType: FundType;
  memo: string;
  date: string;
}

interface BalancedEntryResult {
  entryId: string;
  debitLineId: string;
  creditLineId: string;
}

async function postBalancedEntry(
  sql: Sql,
  communityId: string,
  accountsByCode: Map<string, AccountRef>,
  createdByUserId: string | null,
  input: BalancedEntryInput,
): Promise<BalancedEntryResult> {
  const debitAccount = accountsByCode.get(input.debitAccountCode);
  const creditAccount = accountsByCode.get(input.creditAccountCode);
  if (!debitAccount) {
    throw new Error(
      `Unknown debit account code ${input.debitAccountCode} for community ${communityId}`,
    );
  }
  if (!creditAccount) {
    throw new Error(
      `Unknown credit account code ${input.creditAccountCode} for community ${communityId}`,
    );
  }
  if (debitAccount.fundType !== creditAccount.fundType) {
    throw new Error(
      `Refusing to post a commingled entry "${input.memo}": ` +
        `${input.debitAccountCode} is ${debitAccount.fundType} but ` +
        `${input.creditAccountCode} is ${creditAccount.fundType}. Operating and ` +
        `reserve funds must balance independently.`,
    );
  }
  if (debitAccount.fundType !== input.fundType) {
    throw new Error(
      `fundType mismatch on "${input.memo}": accounts are ${debitAccount.fundType} ` +
        `but caller passed fundType=${input.fundType}`,
    );
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(
      `amountCents must be a positive integer for "${input.memo}", got ${input.amountCents}`,
    );
  }

  const entryId = input.id;
  const debitLineId = `${entryId}-dr`;
  const creditLineId = `${entryId}-cr`;

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO journal_entries (id, community_id, entry_date, memo, created_by_user_id, posted_at)
      VALUES (${entryId}, ${communityId}, ${input.date}, ${input.memo}, ${createdByUserId}, NOW())
      ON CONFLICT DO NOTHING
    `;
    // fundType on each line is copied from the looked-up account, not from
    // input.fundType, mirroring postEntry()'s trust boundary.
    await tx`
      INSERT INTO journal_lines (id, entry_id, community_id, account_id, debit_cents, credit_cents, fund_type)
      VALUES (${debitLineId}, ${entryId}, ${communityId}, ${debitAccount.id}, ${input.amountCents}, 0, ${debitAccount.fundType})
      ON CONFLICT DO NOTHING
    `;
    await tx`
      INSERT INTO journal_lines (id, entry_id, community_id, account_id, debit_cents, credit_cents, fund_type)
      VALUES (${creditLineId}, ${entryId}, ${communityId}, ${creditAccount.id}, 0, ${input.amountCents}, ${creditAccount.fundType})
      ON CONFLICT DO NOTHING
    `;
  });

  return { entryId, debitLineId, creditLineId };
}

// ─────────────────────────────────────────────────────────────────────────
// Treasurer community — the full rich dataset.
// ─────────────────────────────────────────────────────────────────────────

const DUES_AMOUNT_CENTS = 28500; // $285/mo

const PERIODS = [
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
] as const;

const HOMEOWNER_NAMES: Array<{ first: string; last: string }> = [
  { first: "Alicia", last: "Chen" },
  { first: "Marcus", last: "Webb" },
  { first: "Renee", last: "Dupont" },
  { first: "Trevor", last: "Boyd" },
  { first: "Sofia", last: "Marchetti" },
  { first: "Grace", last: "Kim" },
  { first: "Owen", last: "Fairweather" },
  { first: "Natalie", last: "Ross" },
  { first: "Devon", last: "Okafor" },
  { first: "Harold", last: "Whitfield" },
  { first: "Ines", last: "Torres" },
  { first: "Callum", last: "Reyes" },
  { first: "Brianna", last: "Foster" },
  { first: "Aaron", last: "Liu" },
  { first: "Wanda", last: "Sutter" },
  { first: "Felix", last: "Draper" },
];

const CHRONIC_PAST_DUE = new Set([3]); // Trevor Boyd — past due every period
const RECOVERING_PAST_DUE = new Set([9]); // Harold Whitfield — caught up in Jun/Jul
const PENDING_LAST_PERIOD = new Set([5, 10, 14]); // still pending for Jul

function assessmentStatus(
  periodIndex: number,
  unitIndex: number,
): "paid" | "past_due" | "pending" {
  if (CHRONIC_PAST_DUE.has(unitIndex)) return "past_due";
  if (RECOVERING_PAST_DUE.has(unitIndex) && periodIndex <= 3) return "past_due";
  if (periodIndex === 5 && PENDING_LAST_PERIOD.has(unitIndex)) return "pending";
  return "paid";
}

const PAYMENT_METHODS = ["ach", "card", "check"] as const;

async function seedTreasurerRoster(
  sql: Sql,
  communityId: string,
): Promise<{ unitIds: string[]; homeownerIds: string[] }> {
  const unitIds: string[] = [];
  const homeownerIds: string[] = [];

  for (const [i, name] of HOMEOWNER_NAMES.entries()) {
    const idx = String(i + 1).padStart(2, "0");
    const unitId = `demo-unit-${idx}`;
    const homeownerId = `demo-owner-${idx}`;
    const unitNumber = String(101 + i);
    const email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}@example-demo.gavelhouse.test`;

    await sql`
      INSERT INTO units (id, community_id, address, unit_number, sqft, active)
      VALUES (${unitId}, ${communityId}, '1200 Meadowbrook Lane', ${unitNumber}, ${900 + (i % 4) * 120}, true)
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO homeowners (id, community_id, first_name, last_name, email, phone, move_in_date, active)
      VALUES (${homeownerId}, ${communityId}, ${name.first}, ${name.last}, ${email}, ${`555-01${idx}`}, '2023-06-01', true)
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO unit_ownerships (id, unit_id, homeowner_id, start_date, "primary")
      VALUES (${`demo-ownership-${idx}`}, ${unitId}, ${homeownerId}, '2023-06-01', true)
      ON CONFLICT DO NOTHING
    `;

    unitIds.push(unitId);
    homeownerIds.push(homeownerId);
  }

  return { unitIds, homeownerIds };
}

interface BoardMember {
  userId: string;
  memberId: string;
}

async function seedFakeBoardMembers(
  sql: Sql,
  communityId: string,
): Promise<{ secretary: BoardMember; admin: BoardMember }> {
  const secretaryUserId = "demo-board-secretary";
  const adminUserId = "demo-board-admin";

  await sql`
    INSERT INTO "user" (id, name, email, email_verified)
    VALUES (${secretaryUserId}, 'Priya Anand', 'priya.anand@example-demo.gavelhouse.test', true)
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO "user" (id, name, email, email_verified)
    VALUES (${adminUserId}, 'Derek Hayes', 'derek.hayes@example-demo.gavelhouse.test', true)
    ON CONFLICT DO NOTHING
  `;

  const secretaryMemberId = "demo-member-secretary";
  const adminMemberId = "demo-member-admin";

  await sql`
    INSERT INTO community_members (id, community_id, user_id, role, accepted_at)
    VALUES (${secretaryMemberId}, ${communityId}, ${secretaryUserId}, 'secretary', NOW())
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO community_members (id, community_id, user_id, role, accepted_at)
    VALUES (${adminMemberId}, ${communityId}, ${adminUserId}, 'admin', NOW())
    ON CONFLICT DO NOTHING
  `;

  return {
    secretary: { userId: secretaryUserId, memberId: secretaryMemberId },
    admin: { userId: adminUserId, memberId: adminMemberId },
  };
}

interface AssessmentRow {
  periodIndex: number;
  period: string;
  unitIndex: number;
  unitId: string;
  homeownerId: string;
  status: "paid" | "past_due" | "pending";
  assessmentId: string;
}

async function seedTreasurerDues(
  sql: Sql,
  communityId: string,
  unitIds: string[],
  homeownerIds: string[],
): Promise<AssessmentRow[]> {
  const rows: AssessmentRow[] = [];

  for (const [periodIndex, period] of PERIODS.entries()) {
    const dueDate = `${period}-01`;
    for (const [unitIndex, unitId] of unitIds.entries()) {
      const status = assessmentStatus(periodIndex, unitIndex);
      const assessmentId = `demo-assessment-${periodIndex}-${unitIndex}`;
      await sql`
        INSERT INTO assessments (id, community_id, unit_id, period, amount_cents, fund_type, due_date, status)
        VALUES (${assessmentId}, ${communityId}, ${unitId}, ${period}, ${DUES_AMOUNT_CENTS}, 'operating', ${dueDate}, ${status})
        ON CONFLICT DO NOTHING
      `;
      const homeownerId = homeownerIds[unitIndex];
      if (!homeownerId)
        throw new Error(`Missing homeowner for unit index ${unitIndex}`);
      rows.push({
        periodIndex,
        period,
        unitIndex,
        unitId,
        homeownerId,
        status,
        assessmentId,
      });
    }
  }

  return rows;
}

async function seedTreasurerPayments(
  sql: Sql,
  assessments: AssessmentRow[],
  duesRevenueEntryIdForPeriod: Map<string, string>,
): Promise<void> {
  let paymentIndex = 0;
  for (const row of assessments) {
    if (row.status !== "paid") continue;
    const paymentId = `demo-payment-${row.periodIndex}-${row.unitIndex}`;
    const method = PAYMENT_METHODS[paymentIndex % PAYMENT_METHODS.length];
    const receivedAt = `${row.period}-05T14:00:00.000Z`;
    const journalEntryId = duesRevenueEntryIdForPeriod.get(row.period) ?? null;
    await sql`
      INSERT INTO payments (id, assessment_id, homeowner_id, amount_cents, method, received_at, journal_entry_id)
      VALUES (${paymentId}, ${row.assessmentId}, ${row.homeownerId}, ${DUES_AMOUNT_CENTS}, ${method}, ${receivedAt}, ${journalEntryId})
      ON CONFLICT DO NOTHING
    `;
    paymentIndex += 1;
  }
}

const UTILITIES_CENTS: Record<string, number> = {
  "2026-02": 39500,
  "2026-03": 41200,
  "2026-04": 38700,
  "2026-05": 40500,
  "2026-06": 42000,
  "2026-07": 39800,
};
const MGMT_ADMIN_CENTS = 65000;
const MAINTENANCE_CENTS: Record<string, number> = {
  "2026-02": 32000,
  "2026-03": 87500,
  "2026-05": 21000,
  "2026-07": 54000,
};
const INSURANCE_CENTS: Record<string, number> = {
  "2026-02": 145000,
  "2026-05": 145000,
};
const RESERVE_CONTRIBUTION_CENTS: Record<string, number> = {
  "2026-02": 70000,
  "2026-03": 70000,
  "2026-04": 72000,
  "2026-05": 72000,
  "2026-06": 74000,
  "2026-07": 74000,
};
const CAPITAL_PROJECT_MONTH = "2026-06";
const CAPITAL_PROJECT_CENTS = 420000;

interface TreasurerLedger {
  duesRevenueEntryIdForPeriod: Map<string, string>;
  duesRevenueDebitLineIdForPeriod: Map<string, string>; // account 1000 side
  utilitiesCreditLineIdForPeriod: Map<string, string>; // account 1000 side
  mgmtCreditLineIdForPeriod: Map<string, string>; // account 1000 side
  maintenanceCreditLineIdForPeriod: Map<string, string>; // account 1000 side
}

async function seedTreasurerJournal(
  sql: Sql,
  communityId: string,
  createdByUserId: string,
  accountsByCode: Map<string, AccountRef>,
  assessments: AssessmentRow[],
): Promise<TreasurerLedger> {
  const paidCountByPeriod = new Map<string, number>();
  for (const row of assessments) {
    if (row.status !== "paid") continue;
    paidCountByPeriod.set(
      row.period,
      (paidCountByPeriod.get(row.period) ?? 0) + 1,
    );
  }

  const duesRevenueEntryIdForPeriod = new Map<string, string>();
  const duesRevenueDebitLineIdForPeriod = new Map<string, string>();
  const utilitiesCreditLineIdForPeriod = new Map<string, string>();
  const mgmtCreditLineIdForPeriod = new Map<string, string>();
  const maintenanceCreditLineIdForPeriod = new Map<string, string>();

  for (const period of PERIODS) {
    const paidCount = paidCountByPeriod.get(period) ?? 0;
    if (paidCount > 0) {
      const dues = await postBalancedEntry(
        sql,
        communityId,
        accountsByCode,
        createdByUserId,
        {
          id: `demo-je-dues-${period}`,
          debitAccountCode: "1000",
          creditAccountCode: "4000",
          amountCents: paidCount * DUES_AMOUNT_CENTS,
          fundType: "operating",
          memo: `Dues collected — ${period} (${paidCount} units)`,
          date: `${period}-05`,
        },
      );
      duesRevenueEntryIdForPeriod.set(period, dues.entryId);
      duesRevenueDebitLineIdForPeriod.set(period, dues.debitLineId);
    }

    const utilities = await postBalancedEntry(
      sql,
      communityId,
      accountsByCode,
      createdByUserId,
      {
        id: `demo-je-utilities-${period}`,
        debitAccountCode: "5100",
        creditAccountCode: "1000",
        amountCents: UTILITIES_CENTS[period] ?? 0,
        fundType: "operating",
        memo: `Utilities — City Water & Power (${period})`,
        date: `${period}-10`,
      },
    );
    utilitiesCreditLineIdForPeriod.set(period, utilities.creditLineId);

    const mgmt = await postBalancedEntry(
      sql,
      communityId,
      accountsByCode,
      createdByUserId,
      {
        id: `demo-je-mgmt-${period}`,
        debitAccountCode: "5300",
        creditAccountCode: "1000",
        amountCents: MGMT_ADMIN_CENTS,
        fundType: "operating",
        memo: `Management fee — Meadowbrook Management Co (${period})`,
        date: `${period}-12`,
      },
    );
    mgmtCreditLineIdForPeriod.set(period, mgmt.creditLineId);

    const maintenanceAmount = MAINTENANCE_CENTS[period];
    if (maintenanceAmount !== undefined) {
      const maintenance = await postBalancedEntry(
        sql,
        communityId,
        accountsByCode,
        createdByUserId,
        {
          id: `demo-je-maintenance-${period}`,
          debitAccountCode: "5000",
          creditAccountCode: "1000",
          amountCents: maintenanceAmount,
          fundType: "operating",
          memo: `Maintenance — Sunrise Landscaping & Maintenance (${period})`,
          date: `${period}-15`,
        },
      );
      maintenanceCreditLineIdForPeriod.set(period, maintenance.creditLineId);
    }

    const insuranceAmount = INSURANCE_CENTS[period];
    if (insuranceAmount !== undefined) {
      await postBalancedEntry(
        sql,
        communityId,
        accountsByCode,
        createdByUserId,
        {
          id: `demo-je-insurance-${period}`,
          debitAccountCode: "5200",
          creditAccountCode: "1000",
          amountCents: insuranceAmount,
          fundType: "operating",
          memo: `Insurance premium — Operating (${period})`,
          date: `${period}-20`,
        },
      );
    }

    const reserveContribution = RESERVE_CONTRIBUTION_CENTS[period];
    if (reserveContribution !== undefined) {
      await postBalancedEntry(
        sql,
        communityId,
        accountsByCode,
        createdByUserId,
        {
          id: `demo-je-reserve-${period}`,
          debitAccountCode: "1500",
          creditAccountCode: "4100",
          amountCents: reserveContribution,
          fundType: "reserve",
          memo: `Reserve fund contribution — ${period}`,
          date: `${period}-03`,
        },
      );
    }
  }

  await postBalancedEntry(sql, communityId, accountsByCode, createdByUserId, {
    id: `demo-je-capital-${CAPITAL_PROJECT_MONTH}`,
    debitAccountCode: "5600",
    creditAccountCode: "1500",
    amountCents: CAPITAL_PROJECT_CENTS,
    fundType: "reserve",
    memo: "Parking lot seal-coat repair — partial payment",
    date: `${CAPITAL_PROJECT_MONTH}-18`,
  });

  return {
    duesRevenueEntryIdForPeriod,
    duesRevenueDebitLineIdForPeriod,
    utilitiesCreditLineIdForPeriod,
    mgmtCreditLineIdForPeriod,
    maintenanceCreditLineIdForPeriod,
  };
}

async function seedTreasurerReserveStudy(
  sql: Sql,
  communityId: string,
): Promise<void> {
  const studyId = "demo-treasurer-study";
  await sql`
    INSERT INTO reserve_studies
      (id, community_id, effective_date, methodology, annual_budget_cents, annual_reserve_contribution_cents)
    VALUES
      (${studyId}, ${communityId}, '2026-01-15', 'threshold', 50000000, 9000000)
    ON CONFLICT DO NOTHING
  `;

  const components = [
    {
      name: "Roof replacement",
      useful: 25,
      remaining: 8,
      cost: 9500000,
      balance: 4200000,
    },
    {
      name: "Asphalt resurfacing — parking lot",
      useful: 20,
      remaining: 6,
      cost: 5200000,
      balance: 1800000,
    },
    {
      name: "Pool resurfacing & equipment",
      useful: 15,
      remaining: 4,
      cost: 2600000,
      balance: 900000,
    },
    {
      name: "Elevator modernization",
      useful: 30,
      remaining: 18,
      cost: 12000000,
      balance: 6000000,
    },
    {
      name: "Exterior painting & siding",
      useful: 12,
      remaining: 3,
      cost: 3400000,
      balance: 1100000,
    },
    {
      name: "HVAC — common area units",
      useful: 18,
      remaining: 9,
      cost: 4800000,
      balance: 2600000,
    },
  ];
  for (const [i, c] of components.entries()) {
    await sql`
      INSERT INTO reserve_components
        (id, study_id, name, useful_life_years, remaining_life_years, replacement_cost_cents, current_reserve_cents)
      VALUES
        (${`demo-treasurer-comp-${i + 1}`}, ${studyId}, ${c.name}, ${c.useful}, ${c.remaining}, ${c.cost}, ${c.balance})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function seedTreasurerBankRec(
  sql: Sql,
  communityId: string,
  treasurerUserId: string,
  accountsByCode: Map<string, AccountRef>,
  ledger: TreasurerLedger,
): Promise<void> {
  const checkingAccount = accountsByCode.get("1000");
  if (!checkingAccount) throw new Error("Operating Checking account not found");

  const beginningMay = await balanceAsOf(
    sql,
    communityId,
    checkingAccount.id,
    "2026-05-31",
  );
  const endingJune = await balanceAsOf(
    sql,
    communityId,
    checkingAccount.id,
    "2026-06-30",
  );
  const endingJuly = await balanceAsOf(
    sql,
    communityId,
    checkingAccount.id,
    "2026-07-31",
  );

  // ── June statement — fully matched, finalized reconciliation ──────────
  const juneStatementId = "demo-treasurer-stmt-jun";
  await sql`
    INSERT INTO bank_statements (id, community_id, account_id, statement_date, beginning_balance_cents, ending_balance_cents)
    VALUES (${juneStatementId}, ${communityId}, ${checkingAccount.id}, '2026-06-30', ${beginningMay}, ${endingJune})
    ON CONFLICT DO NOTHING
  `;

  const juneDuesLineId = ledger.duesRevenueDebitLineIdForPeriod.get("2026-06");
  const juneUtilitiesLineId =
    ledger.utilitiesCreditLineIdForPeriod.get("2026-06");
  const juneMgmtLineId = ledger.mgmtCreditLineIdForPeriod.get("2026-06");
  if (!juneDuesLineId || !juneUtilitiesLineId || !juneMgmtLineId) {
    throw new Error(
      "Missing June journal lines for bank reconciliation seeding",
    );
  }

  const juneLines: Array<{
    id: string;
    postedDate: string;
    description: string;
    amountCents: number;
    matchLineId: string;
  }> = [
    {
      id: "demo-treasurer-stmt-jun-line-1",
      postedDate: "2026-06-05",
      description: "Deposit — HOA Assessments June 2026",
      amountCents: 427500,
      matchLineId: juneDuesLineId,
    },
    {
      id: "demo-treasurer-stmt-jun-line-2",
      postedDate: "2026-06-10",
      description: "Withdrawal — City Water & Power",
      amountCents: -42000,
      matchLineId: juneUtilitiesLineId,
    },
    {
      id: "demo-treasurer-stmt-jun-line-3",
      postedDate: "2026-06-12",
      description: "Withdrawal — Meadowbrook Management Co",
      amountCents: -65000,
      matchLineId: juneMgmtLineId,
    },
  ];

  for (const line of juneLines) {
    await sql`
      INSERT INTO bank_statement_lines (id, statement_id, community_id, posted_date, description, amount_cents)
      VALUES (${line.id}, ${juneStatementId}, ${communityId}, ${line.postedDate}, ${line.description}, ${line.amountCents})
      ON CONFLICT DO NOTHING
    `;
  }

  const juneReconciliationId = "demo-treasurer-recon-jun";
  await sql`
    INSERT INTO reconciliations (id, community_id, statement_id, status, finalized_at, finalized_by_user_id)
    VALUES (${juneReconciliationId}, ${communityId}, ${juneStatementId}, 'finalized', NOW(), ${treasurerUserId})
    ON CONFLICT DO NOTHING
  `;

  for (const [i, line] of juneLines.entries()) {
    await sql`
      INSERT INTO reconciliation_matches (id, reconciliation_id, community_id, statement_line_id, journal_line_id)
      VALUES (${`demo-treasurer-match-jun-${i + 1}`}, ${juneReconciliationId}, ${communityId}, ${line.id}, ${line.matchLineId})
      ON CONFLICT DO NOTHING
    `;
  }

  // ── July statement — 2 deliberately unmatched lines, open reconciliation ──
  const julyStatementId = "demo-treasurer-stmt-jul";
  await sql`
    INSERT INTO bank_statements (id, community_id, account_id, statement_date, beginning_balance_cents, ending_balance_cents)
    VALUES (${julyStatementId}, ${communityId}, ${checkingAccount.id}, '2026-07-31', ${endingJune}, ${endingJuly})
    ON CONFLICT DO NOTHING
  `;

  const julyDuesLineId = ledger.duesRevenueDebitLineIdForPeriod.get("2026-07");
  const julyUtilitiesLineId =
    ledger.utilitiesCreditLineIdForPeriod.get("2026-07");
  const julyMgmtLineId = ledger.mgmtCreditLineIdForPeriod.get("2026-07");
  const julyMaintenanceLineId =
    ledger.maintenanceCreditLineIdForPeriod.get("2026-07");
  if (
    !julyDuesLineId ||
    !julyUtilitiesLineId ||
    !julyMgmtLineId ||
    !julyMaintenanceLineId
  ) {
    throw new Error(
      "Missing July journal lines for bank reconciliation seeding",
    );
  }

  const julyMatchedLines: Array<{
    id: string;
    postedDate: string;
    description: string;
    amountCents: number;
    matchLineId: string;
  }> = [
    {
      id: "demo-treasurer-stmt-jul-line-1",
      postedDate: "2026-07-05",
      description: "Deposit — HOA Assessments July 2026",
      amountCents: 342000,
      matchLineId: julyDuesLineId,
    },
    {
      id: "demo-treasurer-stmt-jul-line-2",
      postedDate: "2026-07-10",
      description: "Withdrawal — City Water & Power",
      amountCents: -39800,
      matchLineId: julyUtilitiesLineId,
    },
    {
      id: "demo-treasurer-stmt-jul-line-3",
      postedDate: "2026-07-12",
      description: "Withdrawal — Meadowbrook Management Co",
      amountCents: -65000,
      matchLineId: julyMgmtLineId,
    },
    {
      id: "demo-treasurer-stmt-jul-line-4",
      postedDate: "2026-07-15",
      description: "Withdrawal — Sunrise Landscaping & Maintenance",
      amountCents: -54000,
      matchLineId: julyMaintenanceLineId,
    },
  ];
  const julyUnmatchedLines: Array<{
    id: string;
    postedDate: string;
    description: string;
    amountCents: number;
  }> = [
    {
      id: "demo-treasurer-stmt-jul-line-5",
      postedDate: "2026-07-20",
      description: "Bank Service Charge",
      amountCents: -1800,
    },
    {
      id: "demo-treasurer-stmt-jul-line-6",
      postedDate: "2026-07-22",
      description: "Unidentified Deposit",
      amountCents: 150,
    },
  ];

  for (const line of [...julyMatchedLines, ...julyUnmatchedLines]) {
    await sql`
      INSERT INTO bank_statement_lines (id, statement_id, community_id, posted_date, description, amount_cents)
      VALUES (${line.id}, ${julyStatementId}, ${communityId}, ${line.postedDate}, ${line.description}, ${line.amountCents})
      ON CONFLICT DO NOTHING
    `;
  }

  const julyReconciliationId = "demo-treasurer-recon-jul";
  await sql`
    INSERT INTO reconciliations (id, community_id, statement_id, status)
    VALUES (${julyReconciliationId}, ${communityId}, ${julyStatementId}, 'open')
    ON CONFLICT DO NOTHING
  `;

  for (const [i, line] of julyMatchedLines.entries()) {
    await sql`
      INSERT INTO reconciliation_matches (id, reconciliation_id, community_id, statement_line_id, journal_line_id)
      VALUES (${`demo-treasurer-match-jul-${i + 1}`}, ${julyReconciliationId}, ${communityId}, ${line.id}, ${line.matchLineId})
      ON CONFLICT DO NOTHING
    `;
  }
  // julyUnmatchedLines intentionally get no reconciliation_matches row.
}

interface ViolationSeed {
  unitIndex: number;
  title: string;
  description: string;
  status: "open" | "notified" | "cured" | "closed";
}

const VIOLATIONS: ViolationSeed[] = [
  {
    unitIndex: 0,
    title: "Trash bins left at curb past pickup day",
    description:
      "Bins from unit 101 were left at the curb three days after the scheduled pickup, in violation of the community's exterior maintenance standards.",
    status: "open",
  },
  {
    unitIndex: 2,
    title: "Unregistered vehicle in guest parking",
    description:
      "An unregistered vehicle has been parked in guest parking spot 4 for over two weeks.",
    status: "open",
  },
  {
    unitIndex: 4,
    title: "Unapproved exterior paint color",
    description:
      "The front door of unit 105 was repainted a color not on the approved palette.",
    status: "notified",
  },
  {
    unitIndex: 6,
    title: "Pet off-leash in common area",
    description:
      "A dog was observed off-leash in the courtyard on multiple occasions.",
    status: "notified",
  },
  {
    unitIndex: 8,
    title: "Holiday lights left up past removal deadline",
    description:
      "Exterior holiday lighting at unit 109 remained installed well past the community's removal deadline.",
    status: "cured",
  },
  {
    unitIndex: 10,
    title: "Satellite dish installed without approval",
    description:
      "A satellite dish was mounted on the balcony railing without architectural approval.",
    status: "cured",
  },
  {
    unitIndex: 12,
    title: "Storage items visible on patio",
    description:
      "Boxes and storage bins have been stored on the patio in view of the common walkway.",
    status: "closed",
  },
  {
    unitIndex: 14,
    title: "Excessive noise complaint — repeated",
    description:
      "Multiple neighbors reported repeated late-night noise from unit 115.",
    status: "closed",
  },
];

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function seedTreasurerViolations(
  sql: Sql,
  communityId: string,
  unitIds: string[],
  homeownerIds: string[],
  treasurerUserId: string,
): Promise<void> {
  for (const [i, v] of VIOLATIONS.entries()) {
    const violationId = `demo-violation-${i + 1}`;
    const unitId = unitIds[v.unitIndex];
    const homeownerId = homeownerIds[v.unitIndex];
    const base = new Date(Date.UTC(2026, 5, 1 + i * 3)); // spread across June 2026

    await sql`
      INSERT INTO violations (id, community_id, unit_id, homeowner_id, title, description, status, created_by_user_id, created_at)
      VALUES (${violationId}, ${communityId}, ${unitId}, ${homeownerId}, ${v.title}, ${v.description}, ${v.status}, ${treasurerUserId}, ${addDays(base, 0)})
      ON CONFLICT DO NOTHING
    `;

    const history: Array<"open" | "notified" | "cured" | "closed"> = ["open"];
    if (v.status !== "open") history.push("notified");
    if (v.status === "cured" || v.status === "closed") history.push("cured");
    if (v.status === "closed") history.push("closed");

    for (const [step, toStatus] of history.entries()) {
      const note =
        toStatus === "open"
          ? "Violation logged after board walkthrough."
          : toStatus === "notified"
            ? "Notice letter sent to homeowner."
            : toStatus === "cured"
              ? "Homeowner corrected the issue; confirmed on follow-up inspection."
              : "Case closed — no further action needed.";
      await sql`
        INSERT INTO violation_events (id, violation_id, community_id, to_status, note, actor_user_id, occurred_at)
        VALUES (${`demo-violation-event-${i + 1}-${step + 1}`}, ${violationId}, ${communityId}, ${toStatus}, ${note}, ${treasurerUserId}, ${addDays(base, step * 5)})
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

interface ArchRequestSeed {
  unitIndex: number;
  requestType: string;
  description: string;
  status: "pending" | "approved" | "approved_with_conditions" | "denied";
  reviewNote: string | null;
}

const ARCH_REQUESTS: ArchRequestSeed[] = [
  {
    unitIndex: 1,
    requestType: "Fence installation",
    description: "Install a 4-foot picket fence around the back patio.",
    status: "pending",
    reviewNote: null,
  },
  {
    unitIndex: 3,
    requestType: "Solar panel installation",
    description: "Add roof-mounted solar panels on the south-facing slope.",
    status: "pending",
    reviewNote: null,
  },
  {
    unitIndex: 5,
    requestType: "Paint color change — front door",
    description: "Repaint the front door from white to navy blue.",
    status: "approved",
    reviewNote:
      "Navy blue is on the approved accent color list. Approved as submitted.",
  },
  {
    unitIndex: 7,
    requestType: "Patio cover addition",
    description: "Add a retractable patio awning above the rear patio.",
    status: "approved",
    reviewNote:
      "Matches an existing approved design in the community. Approved as submitted.",
  },
  {
    unitIndex: 9,
    requestType: "Deck extension",
    description: "Extend the rear deck by 6 feet using composite decking.",
    status: "approved_with_conditions",
    reviewNote:
      "Approved provided materials match the community-approved composite decking list.",
  },
  {
    unitIndex: 11,
    requestType: "Window replacement — matching black frames",
    description:
      "Replace all street-facing windows with black-framed, double-pane units.",
    status: "approved_with_conditions",
    reviewNote:
      "Approved with the condition that trim color matches the approved palette.",
  },
  {
    unitIndex: 13,
    requestType: "Shed addition in backyard",
    description: "Add a 10x12 storage shed in the backyard.",
    status: "denied",
    reviewNote:
      "Exceeds the maximum accessory-structure footprint allowed under the governing documents.",
  },
  {
    unitIndex: 15,
    requestType: "Detached carport",
    description: "Build a detached carport adjacent to the driveway.",
    status: "denied",
    reviewNote:
      "Detached structures are not permitted under the current architectural guidelines for this block.",
  },
];

async function seedTreasurerArchRequests(
  sql: Sql,
  communityId: string,
  unitIds: string[],
  homeownerIds: string[],
  treasurerUserId: string,
): Promise<void> {
  for (const [i, a] of ARCH_REQUESTS.entries()) {
    const archId = `demo-arch-${i + 1}`;
    const unitId = unitIds[a.unitIndex];
    const homeownerId = homeownerIds[a.unitIndex];
    const isResolved = a.status !== "pending";
    const reviewedByUserId = isResolved ? treasurerUserId : null;
    // Zero-padded rather than interpolated into the day digit: `1${i}` silently
    // produces an invalid date the moment ARCH_REQUESTS grows past ten entries.
    const reviewedDay = String(10 + (i % 18)).padStart(2, "0");
    const reviewedAt = isResolved
      ? `2026-0${5 + (i % 2)}-${reviewedDay}T16:00:00.000Z`
      : null;

    await sql`
      INSERT INTO arch_requests
        (id, community_id, unit_id, homeowner_id, request_type, description, status, review_note, reviewed_by_user_id, reviewed_at)
      VALUES
        (${archId}, ${communityId}, ${unitId}, ${homeownerId}, ${a.requestType}, ${a.description}, ${a.status}, ${a.reviewNote}, ${reviewedByUserId}, ${reviewedAt})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function seedTreasurerMeetings(
  sql: Sql,
  communityId: string,
  treasurerUserId: string,
  secretaryUserId: string,
  adminUserId: string,
): Promise<void> {
  const pastMeetingId = "demo-meeting-past";
  const minutesText = [
    "Q2 2026 Board Meeting — Meadowbrook Commons",
    "",
    "Attendance: Treasurer Test (owner), Priya Anand (secretary), Derek Hayes (admin).",
    "",
    "1. Financials: Treasurer reviewed May trial balance and reserve fund contributions. No concerns raised.",
    "2. Landscaping contract: Board discussed renewing the contract with Sunrise Landscaping & Maintenance for FY2026.",
    "3. Parking lot resurfacing: Board discussed a proposed special assessment to fund parking lot resurfacing ahead of schedule.",
    "4. Pet policy: Board reviewed a proposed update limiting units to two pets.",
    "",
    "Meeting adjourned 7:45 PM.",
  ].join("\n");

  await sql`
    INSERT INTO meetings
      (id, community_id, title, meeting_type, scheduled_at, location, minutes_text, minutes_finalized_at, created_by_user_id)
    VALUES
      (${pastMeetingId}, ${communityId}, 'Q2 2026 Board Meeting', 'board', '2026-06-15T18:00:00.000Z', 'Community Clubhouse', ${minutesText}, '2026-06-18T09:00:00.000Z', ${treasurerUserId})
    ON CONFLICT DO NOTHING
  `;

  const upcomingMeetingId = "demo-meeting-upcoming";
  await sql`
    INSERT INTO meetings
      (id, community_id, title, meeting_type, scheduled_at, location, created_by_user_id)
    VALUES
      (${upcomingMeetingId}, ${communityId}, 'Q3 2026 Board Meeting', 'board', '2026-08-20T18:00:00.000Z', 'Community Clubhouse', ${treasurerUserId})
    ON CONFLICT DO NOTHING
  `;

  interface MotionSeed {
    id: string;
    text: string;
    movedBy: string;
    secondedBy: string;
    status: "pending" | "passed" | "failed" | "tabled";
    resolved: boolean;
    votes: Array<{ voterUserId: string; choice: "yes" | "no" | "abstain" }>;
  }

  const motions: MotionSeed[] = [
    {
      id: "demo-motion-1",
      text: "Approve renewal of the landscaping contract with Sunrise Landscaping & Maintenance for FY2026.",
      movedBy: treasurerUserId,
      secondedBy: secretaryUserId,
      status: "passed",
      resolved: true,
      votes: [
        { voterUserId: treasurerUserId, choice: "yes" },
        { voterUserId: secretaryUserId, choice: "yes" },
        { voterUserId: adminUserId, choice: "yes" },
      ],
    },
    {
      id: "demo-motion-2",
      text: "Authorize a special assessment of $150 per unit to fund parking lot resurfacing ahead of schedule.",
      movedBy: secretaryUserId,
      secondedBy: adminUserId,
      status: "failed",
      resolved: true,
      votes: [
        { voterUserId: treasurerUserId, choice: "no" },
        { voterUserId: secretaryUserId, choice: "yes" },
        { voterUserId: adminUserId, choice: "no" },
      ],
    },
    {
      id: "demo-motion-3",
      text: "Adopt an updated pet policy limiting units to two pets.",
      movedBy: treasurerUserId,
      secondedBy: adminUserId,
      status: "tabled",
      resolved: false,
      votes: [
        { voterUserId: treasurerUserId, choice: "abstain" },
        { voterUserId: secretaryUserId, choice: "yes" },
        { voterUserId: adminUserId, choice: "no" },
      ],
    },
  ];

  for (const m of motions) {
    const resolvedAt = m.resolved ? "2026-06-15T19:15:00.000Z" : null;
    await sql`
      INSERT INTO motions (id, meeting_id, community_id, text, moved_by_user_id, seconded_by_user_id, status, resolved_at)
      VALUES (${m.id}, ${pastMeetingId}, ${communityId}, ${m.text}, ${m.movedBy}, ${m.secondedBy}, ${m.status}, ${resolvedAt})
      ON CONFLICT DO NOTHING
    `;
    for (const [i, v] of m.votes.entries()) {
      await sql`
        INSERT INTO votes (id, motion_id, community_id, voter_user_id, choice, recorded_at)
        VALUES (${`demo-vote-${m.id}-${i + 1}`}, ${m.id}, ${communityId}, ${v.voterUserId}, ${v.choice}, '2026-06-15T19:10:00.000Z')
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

async function seedTreasurerMonthEndClose(
  sql: Sql,
  communityId: string,
  treasurerUserId: string,
): Promise<void> {
  const CLOSE_STEPS = [
    "reconcile_bank",
    "review_tb",
    "post_adjustments",
    "finalize_minutes",
    "generate_pack",
  ] as const;

  const julyCloseId = "demo-close-2026-07";
  await sql`
    INSERT INTO month_end_closes (id, community_id, period_year, period_month, status, started_at, completed_at, audit_pack_key)
    VALUES (${julyCloseId}, ${communityId}, 2026, 7, 'complete', '2026-08-01T13:00:00.000Z', '2026-08-03T17:00:00.000Z', 'demo/audit-packs/treasurer-2026-07.zip')
    ON CONFLICT DO NOTHING
  `;
  for (const step of CLOSE_STEPS) {
    await sql`
      INSERT INTO close_checklist_items (id, close_id, community_id, step, completed, completed_at, completed_by_user_id)
      VALUES (${`demo-close-item-${julyCloseId}-${step}`}, ${julyCloseId}, ${communityId}, ${step}, true, '2026-08-02T12:00:00.000Z', ${treasurerUserId})
      ON CONFLICT DO NOTHING
    `;
  }

  const augustCloseId = "demo-close-2026-08";
  await sql`
    INSERT INTO month_end_closes (id, community_id, period_year, period_month, status, started_at)
    VALUES (${augustCloseId}, ${communityId}, 2026, 8, 'open', '2026-08-01T13:00:00.000Z')
    ON CONFLICT DO NOTHING
  `;
  const completedSteps = new Set<(typeof CLOSE_STEPS)[number]>([
    "reconcile_bank",
    "review_tb",
  ]);
  for (const step of CLOSE_STEPS) {
    const completed = completedSteps.has(step);
    await sql`
      INSERT INTO close_checklist_items (id, close_id, community_id, step, completed, completed_at, completed_by_user_id)
      VALUES (
        ${`demo-close-item-${augustCloseId}-${step}`}, ${augustCloseId}, ${communityId}, ${step}, ${completed},
        ${completed ? "2026-08-05T12:00:00.000Z" : null}, ${completed ? treasurerUserId : null}
      )
      ON CONFLICT DO NOTHING
    `;
  }
}

/**
 * Mark the activation checklist complete.
 *
 * The steps are stored booleans set by the UI as the user works through
 * onboarding, not values derived from the data. Without this a community with
 * a full roster, a reserve study and six months of dues still reports "0 of 4
 * setup steps complete" on the dashboard. The empty-state community is
 * deliberately left untouched so its checklist renders as a real new account.
 */
async function markActivationComplete(
  sql: Sql,
  communityId: string,
): Promise<void> {
  await sql`
    UPDATE community_activation
    SET roster_imported = true,
        roster_imported_at = NOW(),
        reserve_populated = true,
        reserve_populated_at = NOW(),
        compliance_acknowledged = true,
        compliance_acknowledged_at = NOW(),
        dues_batch_configured = true,
        dues_batch_configured_at = NOW(),
        updated_at = NOW()
    WHERE community_id = ${communityId}
  `;
}

async function seedTreasurerCommunity(sql: Sql): Promise<void> {
  const treasurerUserId = await getUserId(sql, "treasurer@test.gavelhouse.app");
  const communityId = await getOwnerCommunityId(
    sql,
    "treasurer@test.gavelhouse.app",
  );

  await sql`UPDATE communities SET state = 'CA', updated_at = NOW() WHERE id = ${communityId}`;

  const { unitIds, homeownerIds } = await seedTreasurerRoster(sql, communityId);
  const board = await seedFakeBoardMembers(sql, communityId);

  const assessments = await seedTreasurerDues(
    sql,
    communityId,
    unitIds,
    homeownerIds,
  );
  const accountsByCode = await loadAccountsByCode(sql, communityId);
  const ledger = await seedTreasurerJournal(
    sql,
    communityId,
    treasurerUserId,
    accountsByCode,
    assessments,
  );
  await seedTreasurerPayments(
    sql,
    assessments,
    ledger.duesRevenueEntryIdForPeriod,
  );

  await seedTreasurerReserveStudy(sql, communityId);
  await seedTreasurerBankRec(
    sql,
    communityId,
    treasurerUserId,
    accountsByCode,
    ledger,
  );
  await seedTreasurerViolations(
    sql,
    communityId,
    unitIds,
    homeownerIds,
    treasurerUserId,
  );
  await seedTreasurerArchRequests(
    sql,
    communityId,
    unitIds,
    homeownerIds,
    treasurerUserId,
  );
  await seedTreasurerMeetings(
    sql,
    communityId,
    treasurerUserId,
    board.secretary.userId,
    board.admin.userId,
  );
  await seedTreasurerMonthEndClose(sql, communityId, treasurerUserId);
  await markActivationComplete(sql, communityId);

  console.log(`  treasurer community seeded (${communityId})`);
}

// ─────────────────────────────────────────────────────────────────────────
// Portfolio user — a second Portfolio-tier community + portfolio rollup.
// ─────────────────────────────────────────────────────────────────────────

interface MiniCommunitySeed {
  communityId: string;
  idPrefix: string;
  unitCount: number;
  period: string;
  pastDueUnitIndexes: number[];
  reserveStudyId: string;
  components: Array<{
    name: string;
    useful: number;
    remaining: number;
    cost: number;
    balance: number;
  }>;
  annualBudgetCents: number;
  annualReserveContributionCents: number;
  closeComplete: boolean;
}

async function seedMiniCommunityData(
  sql: Sql,
  seed: MiniCommunitySeed,
): Promise<void> {
  const unitIds: string[] = [];
  const homeownerIds: string[] = [];
  const names = [
    { first: "Jordan", last: "Alvarez" },
    { first: "Morgan", last: "Petit" },
    { first: "Kelsey", last: "Nguyen" },
    { first: "Reid", last: "Sinclair" },
  ];

  for (let i = 0; i < seed.unitCount; i += 1) {
    const unitId = `${seed.idPrefix}-unit-${i + 1}`;
    const homeownerId = `${seed.idPrefix}-owner-${i + 1}`;
    const name = names[i % names.length];
    if (!name) throw new Error("Ran out of mini-community homeowner names");
    const email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${seed.idPrefix}@example-demo.gavelhouse.test`;

    await sql`
      INSERT INTO units (id, community_id, address, unit_number, sqft, active)
      VALUES (${unitId}, ${seed.communityId}, '400 Riverside Court', ${String(200 + i)}, 1050, true)
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO homeowners (id, community_id, first_name, last_name, email, move_in_date, active)
      VALUES (${homeownerId}, ${seed.communityId}, ${name.first}, ${name.last}, ${email}, '2024-01-15', true)
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO unit_ownerships (id, unit_id, homeowner_id, start_date, "primary")
      VALUES (${`${seed.idPrefix}-ownership-${i + 1}`}, ${unitId}, ${homeownerId}, '2024-01-15', true)
      ON CONFLICT DO NOTHING
    `;
    unitIds.push(unitId);
    homeownerIds.push(homeownerId);
  }

  for (let i = 0; i < seed.unitCount; i += 1) {
    const status = seed.pastDueUnitIndexes.includes(i) ? "past_due" : "paid";
    const assessmentId = `${seed.idPrefix}-assessment-${i + 1}`;
    await sql`
      INSERT INTO assessments (id, community_id, unit_id, period, amount_cents, fund_type, due_date, status)
      VALUES (${assessmentId}, ${seed.communityId}, ${unitIds[i]}, ${seed.period}, ${DUES_AMOUNT_CENTS}, 'operating', ${`${seed.period}-01`}, ${status})
      ON CONFLICT DO NOTHING
    `;
    if (status === "paid") {
      await sql`
        INSERT INTO payments (id, assessment_id, homeowner_id, amount_cents, method, received_at)
        VALUES (${`${seed.idPrefix}-payment-${i + 1}`}, ${assessmentId}, ${homeownerIds[i]}, ${DUES_AMOUNT_CENTS}, 'ach', ${`${seed.period}-05T14:00:00.000Z`})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  await sql`
    INSERT INTO reserve_studies
      (id, community_id, effective_date, methodology, annual_budget_cents, annual_reserve_contribution_cents)
    VALUES
      (${seed.reserveStudyId}, ${seed.communityId}, '2026-01-15', 'threshold', ${seed.annualBudgetCents}, ${seed.annualReserveContributionCents})
    ON CONFLICT DO NOTHING
  `;
  for (const [i, c] of seed.components.entries()) {
    await sql`
      INSERT INTO reserve_components
        (id, study_id, name, useful_life_years, remaining_life_years, replacement_cost_cents, current_reserve_cents)
      VALUES
        (${`${seed.idPrefix}-comp-${i + 1}`}, ${seed.reserveStudyId}, ${c.name}, ${c.useful}, ${c.remaining}, ${c.cost}, ${c.balance})
      ON CONFLICT DO NOTHING
    `;
  }

  if (seed.closeComplete) {
    const closeId = `${seed.idPrefix}-close-2026-07`;
    await sql`
      INSERT INTO month_end_closes (id, community_id, period_year, period_month, status, started_at, completed_at)
      VALUES (${closeId}, ${seed.communityId}, 2026, 7, 'complete', '2026-08-01T13:00:00.000Z', '2026-08-02T17:00:00.000Z')
      ON CONFLICT DO NOTHING
    `;
  }
}

async function seedPortfolio(sql: Sql): Promise<void> {
  const portfolioUserId = await getUserId(sql, "portfolio@test.gavelhouse.app");
  const community1Id = await getOwnerCommunityId(
    sql,
    "portfolio@test.gavelhouse.app",
  );

  await sql`UPDATE communities SET state = 'FL', updated_at = NOW() WHERE id = ${community1Id}`;

  const community2Id = "demo-portfolio-community-2";
  await sql`
    INSERT INTO communities (id, name, slug, state, owner_user_id, stripe_price_id)
    VALUES (${community2Id}, 'Mesa Verde Community Association', 'mesa-verde-community-association-demo', 'TX', ${portfolioUserId}, 'price_portfolio')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO community_members (id, community_id, user_id, role, accepted_at)
    VALUES ('demo-portfolio-community-2-owner', ${community2Id}, ${portfolioUserId}, 'owner', NOW())
    ON CONFLICT DO NOTHING
  `;

  const now = Date.now();
  const trialStartedAt = new Date(now).toISOString();
  const trialEndsAt = new Date(
    now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await sql`
    INSERT INTO subscriptions (id, community_id, tier, status, trial_started_at, trial_ends_at)
    VALUES ('demo-portfolio-community-2-sub', ${community2Id}, 'portfolio', 'trialing', ${trialStartedAt}, ${trialEndsAt})
    ON CONFLICT DO NOTHING
  `;
  await insertAccountsDirect(sql, community2Id, "demo-portfolio-community-2");

  // Community 1 (Cypress Bay HOA, FL) — better funded, compliant.
  await seedMiniCommunityData(sql, {
    communityId: community1Id,
    idPrefix: "demo-portfolio-c1",
    unitCount: 4,
    period: "2026-07",
    pastDueUnitIndexes: [1],
    reserveStudyId: "demo-portfolio-c1-study",
    components: [
      {
        name: "Roof replacement",
        useful: 25,
        remaining: 14,
        cost: 6000000,
        balance: 3200000,
      },
      {
        name: "Pool equipment",
        useful: 12,
        remaining: 5,
        cost: 1800000,
        balance: 1300000,
      },
      {
        name: "Exterior painting",
        useful: 10,
        remaining: 4,
        cost: 1400000,
        balance: 900000,
      },
    ],
    annualBudgetCents: 30000000,
    annualReserveContributionCents: 5400000, // 18% — compliant
    closeComplete: true,
  });

  // Community 2 (Mesa Verde Community Association, TX) — underfunded, non-compliant.
  await seedMiniCommunityData(sql, {
    communityId: community2Id,
    idPrefix: "demo-portfolio-c2",
    unitCount: 4,
    period: "2026-07",
    pastDueUnitIndexes: [0, 2],
    reserveStudyId: "demo-portfolio-c2-study",
    components: [
      {
        name: "Roof replacement",
        useful: 25,
        remaining: 7,
        cost: 7000000,
        balance: 900000,
      },
      {
        name: "Parking lot resurfacing",
        useful: 20,
        remaining: 3,
        cost: 3200000,
        balance: 600000,
      },
      {
        name: "Clubhouse HVAC",
        useful: 15,
        remaining: 6,
        cost: 1600000,
        balance: 300000,
      },
    ],
    annualBudgetCents: 22000000,
    annualReserveContributionCents: 1100000, // 5% — not compliant
    closeComplete: false,
  });

  const portfolioId = "demo-portfolio-1";
  await sql`
    INSERT INTO portfolios (id, name, owner_user_id)
    VALUES (${portfolioId}, 'Demo Portfolio', ${portfolioUserId})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO portfolio_communities (id, portfolio_id, community_id)
    VALUES ('demo-portfolio-link-1', ${portfolioId}, ${community1Id})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO portfolio_communities (id, portfolio_id, community_id)
    VALUES ('demo-portfolio-link-2', ${portfolioId}, ${community2Id})
    ON CONFLICT DO NOTHING
  `;

  await markActivationComplete(sql, community1Id);
  await markActivationComplete(sql, community2Id);

  console.log(
    `  portfolio seeded: ${community1Id} (Cypress Bay HOA), ${community2Id} (Mesa Verde)`,
  );
}

async function main(): Promise<void> {
  console.log(
    `Seeding demo data via ${API} → ${DB_URL.replace(/:[^@]+@/, ":***@")}`,
  );

  for (const u of USERS) {
    const { created } = await signUp(u);
    console.log(`  ${created ? "created" : "exists"}: ${u.email}`);
  }

  const sql = postgres(DB_URL, { prepare: false });
  try {
    for (const u of USERS) {
      if (u.tier === null) continue;
      await setTier(sql, u.email, u.tier);
      console.log(`  tier=${u.tier}: ${u.email}`);
    }

    await seedTreasurerCommunity(sql);
    await seedPortfolio(sql);

    // empty@test.gavelhouse.app is intentionally left untouched beyond signup.
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    "\nDone. Login at http://localhost:3060/login with password:",
    PASSWORD,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

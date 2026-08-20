/**
 * Dev seed script.
 *
 * Prerequisites: API running on http://localhost:8060 and Postgres at $DATABASE_URL.
 *
 * Creates two users + communities for QA:
 *   - treasurer@test.gavelhouse.app (Scale tier)   — covers reports/audit pack/close
 *   - portfolio@test.gavelhouse.app  (Portfolio tier) — covers portfolio rollup
 *
 * Idempotent: re-running upserts tier/status; signup is skipped if the email already exists.
 */
import postgres from "postgres";

const API = process.env["API_URL"] ?? "http://localhost:8060";
// Better Auth rejects sign-up/sign-in unless the request Origin is one of the
// API's trusted origins (the app, not the API itself — see buildTrustedOrigins
// in src/lib/auth.ts). Use the dashboard origin so seeding actually creates users.
const APP_ORIGIN = process.env["APP_URL"] ?? "http://localhost:3060";
const DB_URL =
  process.env["DATABASE_URL"] ??
  "postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev";

const PASSWORD = "Test1234!";

interface SeedUser {
  name: string;
  email: string;
  tier: "starter" | "growth" | "scale" | "portfolio";
}

const USERS: SeedUser[] = [
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
];

async function signUp(user: SeedUser): Promise<{ created: boolean }> {
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
  // Better Auth returns 400/422/409 family on duplicate. Treat as already-exists.
  if (res.status >= 400 && res.status < 500) {
    if (/exists|already|registered|duplicate/i.test(body))
      return { created: false };
    // Some configs surface duplicate as a generic 422. Log and continue.
    console.warn(
      `  signup ${user.email} returned ${res.status}: ${body.slice(0, 200)}`,
    );
    return { created: false };
  }
  throw new Error(`Signup failed for ${user.email} (${res.status}): ${body}`);
}

const TIER_PRICE_ID: Record<SeedUser["tier"], string> = {
  starter: "price_starter",
  growth: "price_growth",
  scale: "price_scale",
  portfolio: "price_portfolio",
};

async function setTier(
  sql: ReturnType<typeof postgres>,
  email: string,
  tier: SeedUser["tier"],
): Promise<void> {
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

async function seedReserveStudy(
  sql: ReturnType<typeof postgres>,
  email: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT cm.community_id AS id
    FROM community_members cm
    JOIN "user" u ON u.id = cm.user_id
    WHERE u.email = ${email} AND cm.role = 'owner'
    LIMIT 1
  `;
  if (!rows[0]) return;
  const communityId = rows[0].id;

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM reserve_studies WHERE community_id = ${communityId} LIMIT 1
  `;
  if (existing[0]) return;

  const studyId = `seed-study-${communityId}`;
  await sql`
    INSERT INTO reserve_studies (id, community_id, effective_date, methodology)
    VALUES (${studyId}, ${communityId}, '2025-01-01', 'threshold')
    ON CONFLICT DO NOTHING
  `;

  const components = [
    {
      name: "Roof replacement",
      useful: 25,
      remaining: 10,
      cost: 8000000,
      balance: 3200000,
    },
    {
      name: "Parking lot",
      useful: 20,
      remaining: 8,
      cost: 4000000,
      balance: 1600000,
    },
    {
      name: "Pool resurfacing",
      useful: 15,
      remaining: 5,
      cost: 2000000,
      balance: 800000,
    },
  ];
  for (const [i, c] of components.entries()) {
    await sql`
      INSERT INTO reserve_components
        (id, study_id, name, useful_life_years, remaining_life_years, replacement_cost_cents, current_reserve_cents)
      VALUES
        (${`seed-comp-${communityId}-${i}`}, ${studyId}, ${c.name}, ${c.useful}, ${c.remaining}, ${c.cost}, ${c.balance})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function main(): Promise<void> {
  console.log(
    `Seeding dev data via ${API} → ${DB_URL.replace(/:[^@]+@/, ":***@")}`,
  );

  // 1) Sign up users (creates community + trialing sub + activation via auth hook)
  for (const u of USERS) {
    const { created } = await signUp(u);
    console.log(`  ${created ? "created" : "exists"}: ${u.email}`);
  }

  // 2) Set tiers directly in DB + seed reserve study
  const sql = postgres(DB_URL, { prepare: false });
  try {
    for (const u of USERS) {
      await setTier(sql, u.email, u.tier);
      console.log(`  tier=${u.tier}: ${u.email}`);
    }
    await seedReserveStudy(sql, "treasurer@test.gavelhouse.app");
    console.log("  reserve study seeded for treasurer@test.gavelhouse.app");
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

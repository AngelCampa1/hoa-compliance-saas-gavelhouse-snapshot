import { eq } from "drizzle-orm";
import { portfolios } from "../../db/schema/portfolio.js";
import type { Db } from "../../db/client.js";

export class PortfolioForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden: not portfolio owner") {
    super(message);
    this.name = "PortfolioForbiddenError";
  }
}

export async function requirePortfolioOwner(
  db: Db,
  portfolioId: string,
  userId: string,
): Promise<void> {
  const [row] = await db
    .select({ ownerUserId: portfolios.ownerUserId })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);

  if (!row || row.ownerUserId !== userId) {
    throw new PortfolioForbiddenError();
  }
}

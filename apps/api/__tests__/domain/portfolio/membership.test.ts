import { describe, it, expect, vi } from "vitest";
import { requirePortfolioOwner } from "../../../src/domain/portfolio/membership.js";
import type { Db } from "../../../src/db/client.js";

function makeMockDb(ownerUserId: string | null, found = true): Db {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue(
              found && ownerUserId !== null ? [{ ownerUserId }] : [],
            ),
        }),
      }),
    }),
  } as unknown as Db;
}

describe("requirePortfolioOwner", () => {
  it("resolves without throwing when userId matches the portfolio owner", async () => {
    const db = makeMockDb("user-1");
    await expect(
      requirePortfolioOwner(db, "portfolio-1", "user-1"),
    ).resolves.toBeUndefined();
  });

  it("throws a 403 error when portfolio is not found", async () => {
    const db = makeMockDb(null, false);
    await expect(
      requirePortfolioOwner(db, "portfolio-1", "user-1"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws a 403 error when userId does not match the portfolio owner", async () => {
    const db = makeMockDb("user-other");
    await expect(
      requirePortfolioOwner(db, "portfolio-1", "user-1"),
    ).rejects.toMatchObject({ status: 403 });
  });
});

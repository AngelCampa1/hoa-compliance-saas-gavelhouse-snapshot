import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock postgres before importing client
vi.mock("postgres", () => {
  return {
    default: vi.fn(() => ({})),
  };
});

vi.mock("drizzle-orm/postgres-js", () => {
  return {
    drizzle: vi.fn(() => ({ _isDb: true })),
  };
});

import { createDb } from "../../src/db/client.js";

describe("createDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when DATABASE_URL is not provided", () => {
    expect(() => createDb({})).toThrow(
      "No database connection string available",
    );
  });

  it("uses DATABASE_URL when provided", async () => {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    createDb({ DATABASE_URL: "postgres://direct" });
    expect(postgres).toHaveBeenCalledWith("postgres://direct", {
      prepare: false,
    });
    expect(drizzle).toHaveBeenCalled();
  });
});

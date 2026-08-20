import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Env = {
  DATABASE_URL?: string;
};

export function createDb(env: Env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString)
    throw new Error("No database connection string available");
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

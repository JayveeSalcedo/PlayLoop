import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

/**
 * Lazily creates a singleton Drizzle client from DATABASE_URL. Point this at
 * a Supabase Free Postgres connection string (use the pooler/connection
 * string from Project Settings -> Database) or any Postgres instance.
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Supabase (or local) Postgres connection string.",
    );
  }
  const client = postgres(url, { prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}

/**
 * THROWAWAY MIGRATION — run once, check the output, then delete this file.
 *
 *   cd packages/db && npx tsx src/_migrate_test_plays_tmp.ts
 *
 * play_sessions gains is_test: a creator's studio test play of an unpublished
 * version. Verified like any play, never credited. Additive; every existing
 * session is correctly a real play (false) with no backfill.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
const sql = postgres(url, { prepare: false });

async function main() {
  await sql.begin(async (tx) => {
    await tx`ALTER TABLE play_sessions ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`;
  });
  const [col] = await sql<{ data_type: string; is_nullable: string; column_default: string }[]>`
    SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'play_sessions' AND column_name = 'is_test'
  `;
  const [tests] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM play_sessions WHERE is_test`;
  console.log(`play_sessions.is_test: ${col?.data_type}, nullable ${col?.is_nullable}, default ${col?.column_default}`);
  console.log(`existing sessions marked as tests: ${tests?.n} (expected 0)`);
  const ok = col?.data_type === "boolean" && col.is_nullable === "NO" && tests?.n === 0;
  console.log(ok ? "\nAll checks passed. Delete this file." : "\nSomething is off — see above.");
  await sql.end();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Migration failed and rolled back — the database is unchanged.");
  console.error(e);
  await sql.end();
  process.exit(1);
});

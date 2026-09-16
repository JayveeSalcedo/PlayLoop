/**
 * THROWAWAY MIGRATION — run once, check the output, then delete this file.
 *
 *   cd packages/db && npx tsx src/_migrate_drafts_jobs_tmp.ts
 *
 * 1. game_status gains 'draft': a creator's unsubmitted game — an AI
 *    generation in progress, or versions still being changed. Keeps drafts out
 *    of the moderation queue and PENDING_LIMIT, which both read
 *    'pending_review'.
 * 2. generation_jobs gains `state`: the pipeline's saved progress between
 *    rounds, since on Vercel's Hobby limits each round runs in its own
 *    invocation.
 *
 * Postgres (12+) allows ADD VALUE inside a transaction as long as the new value
 * isn't *used* in that same transaction, and nothing here uses it. Additive
 * only: no existing row or query changes.
 *
 * Verification runs after commit, in a fresh query, and exits non-zero if
 * anything is off.
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
    await tx`ALTER TYPE game_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'pending_review'`;
    await tx`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS state jsonb`;
  });
  console.log("Migration committed. Verifying…");

  const labels = (await sql<{ enumlabel: string }[]>`
    SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'game_status' ORDER BY e.enumsortorder
  `).map((r) => r.enumlabel);
  const [column] = await sql<{ data_type: string; is_nullable: string }[]>`
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'generation_jobs' AND column_name = 'state'
  `;
  const [drafts] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM games WHERE status = 'draft'`;

  const problems: string[] = [];
  if (labels.join(",") !== "draft,pending_review,published,rejected") problems.push(`game_status is [${labels}]`);
  if (column?.data_type !== "jsonb" || column.is_nullable !== "YES") problems.push(`generation_jobs.state is ${JSON.stringify(column)}`);

  console.log(`  game_status: [${labels.join(", ")}]`);
  console.log(`  generation_jobs.state: ${column?.data_type}, nullable ${column?.is_nullable}`);
  console.log(`  existing games now 'draft': ${drafts?.n} (expected 0)`);
  if ((drafts?.n ?? 0) !== 0) problems.push("existing games changed status");

  console.log(problems.length ? `\nProblems:\n  - ${problems.join("\n  - ")}` : "\nAll checks passed. Delete this file.");
  await sql.end();
  process.exit(problems.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Migration failed and rolled back — the database is unchanged.");
  console.error(e);
  await sql.end();
  process.exit(1);
});

/**
 * Adds a hand-written code game to the database as a new game with one
 * version — e.g. one of the runtime's example games — so the code-game play
 * path can be exercised before AI generation is wired into production.
 *
 *   cd apps/web
 *   ../../packages/db/node_modules/.bin/tsx scripts/seed-code-game.mts <game.js> <slug> [--publish]
 *
 * It runs the real game-lab checks first and records their verdict, exactly as
 * AI generation will: a version that fails is stored as 'fail' and startPlay
 * will never let anyone earn on it. The payout target is derived from the same
 * report by @playloop/economy — calibration only, separate from the verdict.
 *
 * Without --publish the game is left pending review: visible to admins, not in
 * the feed, not playable for points.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, schema } from "@playloop/db";
import { codeScoreTarget } from "@playloop/economy";
import { checkGame } from "@playloop/replay";
import { fnv1a, RUNTIME_VERSION } from "@playloop/runtime";
import { eq } from "drizzle-orm";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main() {
  const [file, slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const publish = process.argv.includes("--publish");
  if (!file || !slug) {
    console.error("usage: tsx scripts/seed-code-game.mts <game.js> <slug> [--publish]");
    process.exit(1);
  }

  const code = readFileSync(file, "utf8");
  console.log(`Checking ${file} in the game lab…`);
  const report = await checkGame(code);
  for (const check of report.checks) console.log(`  ${check.status.padEnd(4)} ${check.title}: ${check.summary}`);
  if (!report.meta) throw new Error("The game didn't load, so there's nothing to seed.");

  const scoreTarget = codeScoreTarget(report.runs);
  console.log(`Verdict: ${report.verdict}. Score target: ${scoreTarget ?? "none (flat payout floor)"}.`);
  if (publish && report.verdict !== "pass") throw new Error("Refusing to publish a game that failed its checks.");

  const db = getDb();
  const existing = await db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.slug, slug));
  if (existing.length > 0) throw new Error(`A game with slug "${slug}" already exists.`);

  const ids = await db.transaction(async (tx) => {
    const [game] = await tx
      .insert(schema.games)
      .values({
        slug,
        gameKind: "code",
        type: null,
        title: report.meta!.title,
        description: report.meta!.hint,
        status: publish ? "published" : "pending_review",
      })
      .returning({ id: schema.games.id });

    const [version] = await tx
      .insert(schema.gameVersions)
      .values({
        gameId: game!.id,
        versionNumber: 1,
        via: "manual",
        request: `Seeded from ${path.basename(file)}`,
        code,
        contentHash: fnv1a(code),
        meta: report.meta as unknown as Record<string, unknown>,
        runtimeVersion: RUNTIME_VERSION,
        title: report.meta!.title,
        summary: report.meta!.hint,
        validation: report.verdict,
        report: report as unknown as Record<string, unknown>,
        scoreTarget,
        status: publish ? "published" : "pending_review",
      })
      .returning({ id: schema.gameVersions.id });

    // current_version_id is DEFERRABLE, so pointing the game at its version in
    // the same transaction is fine.
    await tx.update(schema.games).set({ currentVersionId: version!.id }).where(eq(schema.games.id, game!.id));
    return { gameId: game!.id, versionId: version!.id };
  });

  console.log(`Seeded "${report.meta.title}" as /play/${slug} (game ${ids.gameId}, version ${ids.versionId}), ${publish ? "published" : "pending review"}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

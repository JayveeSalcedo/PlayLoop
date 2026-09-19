"use server";

/**
 * Studio actions that don't go through the AI: start from an example, test a
 * version, pick which version is current, and submit one for review. AI
 * generation itself runs through /api/studio/jobs (see lib/generation/jobs.ts).
 */
import { getDb, schema } from "@playloop/db";
import { EXAMPLE_GAMES } from "@playloop/runtime";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireStudio } from "@/lib/generation/access";
import { addVersion } from "@/lib/generation/versions";
import { PENDING_LIMIT } from "@/lib/moderation";
import { insertStartedSession } from "@/lib/playSessions";

/** The creator's own code-game version, with its game. Same answer for "doesn't exist" and "isn't yours". */
async function ownVersion(profileId: string, versionId: string) {
  const [row] = await getDb()
    .select({ version: schema.gameVersions, game: schema.games })
    .from(schema.gameVersions)
    .innerJoin(schema.games, eq(schema.gameVersions.gameId, schema.games.id))
    .where(and(eq(schema.gameVersions.id, versionId), eq(schema.games.creatorId, profileId), eq(schema.games.gameKind, "code")));
  if (!row) throw new Error("That version doesn't exist.");
  return row;
}

/**
 * Starts a new draft game from one of the runtime's example games, as version 1.
 * The example goes through the game lab like any other code, so its version
 * records a real verdict and score target — examples are starting points, not
 * trusted exceptions.
 */
export async function startFromExample(exampleId: string): Promise<{ gameId: string }> {
  const { profile } = await requireStudio();
  const example = EXAMPLE_GAMES.find((e) => e.id === exampleId);
  if (!example) throw new Error("That example doesn't exist.");

  // @playloop/replay is pure ESM and must stay unbundled (its worker script
  // and QuickJS WASM load by relative path) — a static import here would
  // compile to a require() and crash with ERR_REQUIRE_ESM. See next.config.ts.
  const { checkGame } = await import("@playloop/replay");
  const report = await checkGame(example.code);
  const meta = report.meta;
  if (!meta) throw new Error("That example didn't load. Try another one.");

  const saved = await getDb().transaction((tx) =>
    addVersion(tx, {
      creatorId: profile.id,
      gameId: null,
      version: {
        code: example.code,
        report,
        title: meta.title,
        summary: meta.hint,
        notes: "",
        via: "template",
        request: `Started from the ${meta.title} example`,
      },
    }),
  );
  revalidatePath("/create/games");
  return { gameId: saved.gameId };
}

/**
 * Opens a test-play session on the creator's own version, whatever the game's
 * status. It's played and replay-verified exactly like a real play, but marked
 * is_test, so it's never credited. A verified test play of a version is what
 * submitting that version requires.
 */
export async function startTestPlay(versionId: string): Promise<{ sessionId: string; seed: string }> {
  const { profile } = await requireStudio();
  const { version, game } = await ownVersion(profile.id, versionId);
  // A version that failed its checks may not replay deterministically, so a
  // test play of it couldn't prove anything; fix it first.
  if (version.validation !== "pass") throw new Error("Fix what the checks found before testing this version.");

  const seed = randomBytes(16).toString("hex");
  const row = await getDb().transaction((tx) =>
    insertStartedSession(tx, { profileId: profile.id, gameId: game.id, pin: { gameVersionId: version.id, seed }, isTest: true }),
  );
  return { sessionId: row.id, seed };
}

/** Makes another version the draft's working copy. Nothing is deleted or edited. */
export async function makeVersionCurrent(versionId: string): Promise<void> {
  const { profile } = await requireStudio();
  const { version, game } = await ownVersion(profile.id, versionId);
  if (game.status !== "draft" && game.status !== "rejected") {
    throw new Error("This game has been submitted, so what players get changes only through review.");
  }
  await getDb()
    .update(schema.games)
    .set({ currentVersionId: version.id })
    .where(and(eq(schema.games.id, game.id), inArray(schema.games.status, ["draft", "rejected"])));
  revalidatePath(`/create/studio/${game.id}`);
}

/**
 * Sends a version to the moderation queue.
 *
 * Requires the version to have passed its checks and to have been test-played
 * to a verified result by its creator: a reviewer should never be the first
 * person to find out a game doesn't work.
 *
 * Only for a game that isn't in review or live yet — a draft, or a rejected
 * game being tried again. Updating a live game needs review of the new version
 * while the live one stays in the feed, and the moderation queue reviews whole
 * games today, so that's refused rather than taking the live game down.
 */
export async function submitVersion(versionId: string): Promise<void> {
  const { profile } = await requireStudio();
  const db = getDb();
  const { version, game } = await ownVersion(profile.id, versionId);

  if (game.status === "pending_review") throw new Error("This game is already waiting for review.");
  if (game.status === "published") {
    throw new Error("Updating a live game isn't possible yet — it needs version-by-version review, which is coming next.");
  }
  if (version.validation !== "pass") throw new Error("This version hasn't passed its checks.");

  const [tested] = await db
    .select({ id: schema.playSessions.id })
    .from(schema.playSessions)
    .where(
      and(
        eq(schema.playSessions.profileId, profile.id),
        eq(schema.playSessions.gameVersionId, version.id),
        eq(schema.playSessions.isTest, true),
        eq(schema.playSessions.status, "completed"),
      ),
    )
    .orderBy(desc(schema.playSessions.completedAt))
    .limit(1);
  if (!tested) throw new Error("Test-play this version to the end first, so you know it works.");

  const [pending] = await db
    .select({ n: count() })
    .from(schema.games)
    .where(and(eq(schema.games.creatorId, profile.id), eq(schema.games.status, "pending_review")));
  if ((pending?.n ?? 0) >= PENDING_LIMIT) {
    throw new Error(`You already have ${PENDING_LIMIT} games waiting for review. Hold off until those are through.`);
  }

  const outcome = await db.transaction(async (tx) => {
    // Conditional on the status just checked, so a double-click can't submit twice.
    const [moved] = await tx
      .update(schema.games)
      .set({
        status: "pending_review",
        currentVersionId: version.id,
        title: version.title,
        description: version.summary || game.description,
      })
      .where(and(eq(schema.games.id, game.id), inArray(schema.games.status, ["draft", "rejected"])))
      .returning({ id: schema.games.id });
    if (!moved) return { ok: false as const, error: "This game was just submitted." };

    await tx.update(schema.gameVersions).set({ status: "pending_review" }).where(eq(schema.gameVersions.id, version.id));
    await tx.insert(schema.moderationReviews).values({ gameId: game.id, outcome: "pending" });
    return { ok: true as const };
  });
  if (!outcome.ok) throw new Error(outcome.error);

  revalidatePath(`/create/studio/${game.id}`);
  revalidatePath("/create/games");
  revalidatePath("/admin");
}

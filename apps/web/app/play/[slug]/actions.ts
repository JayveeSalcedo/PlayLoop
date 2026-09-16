"use server";

import { scoreTarget } from "@playloop/economy";
import { playRules, validatePlay, type PlayableType } from "@playloop/games";
import { getDb, schema } from "@playloop/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { creditVerifiedPlay, type PlayResult } from "@/lib/creditPlay";
import { insertStartedSession, type CodePin } from "@/lib/playSessions";
import { requireActiveProfile } from "@/lib/profile";
import { requireSession } from "@/lib/session";

export type { PlayResult };

type GameForStart = {
  id: string;
  status: "draft" | "pending_review" | "published" | "rejected";
  gameKind: "template" | "code";
  currentVersionId: string | null;
};

const selectGameForStart = {
  id: schema.games.id,
  status: schema.games.status,
  gameKind: schema.games.gameKind,
  currentVersionId: schema.games.currentVersionId,
};

/**
 * For a code game: the version this session will be played, replayed and paid
 * under, and the seed its randomness comes from. Both are fixed here and
 * written onto the session row — nothing re-resolves them at submit time, which
 * is what lets a creator publish a new version while people are mid-play.
 *
 * `expectedVersionId` is the version whose code the player's page loaded. If
 * the game moved on since, the browser would play one version while the server
 * replayed another, and an honest play would fail verification — so refuse and
 * have them reload instead.
 */
async function pinCodeVersion(game: GameForStart, expectedVersionId: string | undefined): Promise<CodePin> {
  if (game.gameKind !== "code") return null;
  if (!game.currentVersionId) throw new Error("That game isn't ready to play yet.");
  if (expectedVersionId !== game.currentVersionId) {
    throw new Error("This game was just updated. Reload the page to play the latest version.");
  }

  const version = await getDb()
    .select({ id: schema.gameVersions.id, validation: schema.gameVersions.validation })
    .from(schema.gameVersions)
    .where(eq(schema.gameVersions.id, game.currentVersionId))
    .then((r) => r[0]);
  // A version that failed its checks may not replay deterministically, so it
  // must never be the one players earn on — even if it somehow became current.
  if (version?.validation !== "pass") throw new Error("That game isn't ready to play yet.");

  // The server picks the seed. A client that chose its own could hunt for a
  // favourable game; see play_sessions.seed.
  return { gameVersionId: version.id, seed: randomBytes(16).toString("hex") };
}

/**
 * Opens a play session for `gameId`: abandons this profile's other still-open
 * sessions (only one live session per player at a time) and inserts a new
 * 'started' row, whose server-recorded startedAt is what submission checks
 * elapsed time against. Call this right before mounting the game.
 *
 * For a code game, pass the version id the page loaded; the result includes
 * the server-chosen seed to start the game with.
 */
export async function startPlay(gameId: string, expectedVersionId?: string): Promise<{ sessionId: string; seed: string | null }> {
  const db = getDb();

  // Both round-trips at once — they don't depend on each other, and against a
  // ~90ms Seoul round-trip that's the difference between 90ms and 180ms.
  const [{ session }, game] = await Promise.all([
    requireActiveProfile(),
    db
      .select(selectGameForStart)
      .from(schema.games)
      .where(eq(schema.games.id, gameId))
      .then((r) => r[0]),
  ]);
  if (!game) throw new Error("Game not found");
  // A creator can open their own unpublished game's page, so this is the check
  // that stops them earning points on a game nobody has reviewed yet.
  if (game.status !== "published") throw new Error("That game isn't approved for play yet.");

  const pin = await pinCodeVersion(game, expectedVersionId);
  const row = await db.transaction((tx) => insertStartedSession(tx, { profileId: session.sub, gameId: game.id, pin }));
  return { sessionId: row.id, seed: pin?.seed ?? null };
}

/**
 * Like startPlay, but ties the new session to a challenge (see
 * packages/db/src/schema.ts's `challenges` table). Validated up front,
 * before any write, same style as redeemReward's pre-transaction checks —
 * nothing's been written yet at this point, so a plain throw is fine.
 */
export async function startChallengedPlay(
  gameId: string,
  challengeCode: string,
  expectedVersionId?: string,
): Promise<{ sessionId: string; seed: string | null }> {
  const { session } = await requireActiveProfile();
  const db = getDb();

  const challenge = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.code, challengeCode))
    .then((r) => r[0]);
  if (!challenge) throw new Error("That challenge link doesn't exist.");
  if (challenge.status !== "pending") throw new Error("That challenge has already been answered.");
  if (challenge.gameId !== gameId) throw new Error("That challenge is for a different game.");
  if (challenge.senderId === session.sub) throw new Error("You can't play your own challenge.");

  // A game can be pulled from the feed after a challenge was sent; don't let an
  // old link keep paying out on it.
  const game = await db
    .select(selectGameForStart)
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .then((r) => r[0]);
  if (!game || game.status !== "published") throw new Error("That game isn't available to play right now.");

  const pin = await pinCodeVersion(game, expectedVersionId);
  const row = await db.transaction((tx) => insertStartedSession(tx, { profileId: session.sub, gameId, pin, challengeId: challenge.id }));
  return { sessionId: row.id, seed: pin?.seed ?? null };
}

/**
 * Records a completed play of a **template** game. Unlike a plain "trust the
 * client" score submission, this only credits points for a session the server
 * itself issued (via startPlay) and only once per session:
 *
 *  1. Atomically claim the session — the conditional UPDATE below only
 *     matches a row that's still 'started' and belongs to this profile, so
 *     a replayed/duplicate submitPlay call for the same session fails here
 *     (status no longer 'started') rather than double-crediting.
 *  2. Validate the claimed score against @playloop/games' playRules, using
 *     an elapsed-seconds figure computed entirely DB-side (`now() -
 *     started_at`, in the claim query itself) so app-server/DB clock skew
 *     can't skew it — a submission that's too fast, too old, or implausibly
 *     high-scoring for the template/difficulty is rejected and flips the
 *     session to 'rejected' with a reason, crediting nothing.
 *  3. Otherwise credit it — payout, ledger, balance, challenge resolution and
 *     the referral bonus — through creditVerifiedPlay, which code games share.
 *
 * Code games don't come through here: their score is a claim the server checks
 * by replaying the recorded inputs, in app/api/play/[sessionId]/submit.
 *
 * Everything inside the transaction only ever returns, never throws
 * (Drizzle/Postgres rolls back the *entire* transaction if anything inside it
 * throws, including writes we want to keep); the error is thrown after commit.
 */
export async function submitPlay(sessionId: string, rawScore: number): Promise<PlayResult> {
  const session = await requireSession();
  const score = Math.max(0, Math.round(rawScore));
  const db = getDb();

  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.playSessions)
      .set({ status: "completed", completedAt: sql`now()` })
      .where(
        and(
          eq(schema.playSessions.id, sessionId),
          eq(schema.playSessions.profileId, session.sub),
          eq(schema.playSessions.status, "started"),
          // A code-game session is scored by replay, never by this analytic
          // path. Excluding it here means a code session id sent to this
          // action simply isn't found, instead of being consumed.
          isNull(schema.playSessions.gameVersionId),
        ),
      )
      .returning({
        gameId: schema.playSessions.gameId,
        challengeId: schema.playSessions.challengeId,
        // Computed DB-side (not `Date.now() - startedAt`) so this can't be
        // thrown off by clock skew between the app server and the database.
        elapsedSeconds: sql<number>`extract(epoch from (now() - ${schema.playSessions.startedAt}))`.mapWith(Number),
      });
    if (!claimed) return { ok: false as const, error: "This play session was already used or doesn't exist." };

    const game = await tx
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, claimed.gameId))
      .then((r) => r[0]);
    if (!game) return { ok: false as const, error: "Game not found." };

    const config = (game.config ?? {}) as { questions?: unknown[] };
    // playRules is a switch over the four templates, so a null type would fall
    // through it and return undefined rules, and validatePlay would then read
    // undefined ceilings — paying out on a play nothing actually checked.
    const type: PlayableType | null = game.type;
    if (type === null) {
      return { ok: false as const, error: "That play couldn't be verified, so no points were awarded." };
    }
    const questionCount = type === "quiz" ? (config.questions?.length ?? 1) : undefined;

    const rules = playRules(type, { difficulty: game.difficulty, questionCount });
    const verdict = validatePlay({ elapsedSeconds: claimed.elapsedSeconds, score }, rules);

    if (!verdict.ok) {
      // Keep the claimed score. It's what makes the rejection legible to a
      // reviewer later — "claimed 9,400 where this template tops out at 750"
      // rather than a bare "score_implausible". payoutPoints/xpAwarded stay
      // null, which is what records that nothing was earned.
      await tx
        .update(schema.playSessions)
        .set({ status: "rejected", rejectReason: verdict.reason, score })
        .where(eq(schema.playSessions.id, sessionId));
      return { ok: false as const, error: "That play couldn't be verified, so no points were awarded. Please try again." };
    }

    return creditVerifiedPlay(tx, {
      sessionId,
      profileId: session.sub,
      game,
      score,
      target: scoreTarget(type, questionCount),
      challengeId: claimed.challengeId,
    });
  });

  if (!outcome.ok) throw new Error(outcome.error);
  const { ok: _ok, ...result } = outcome;
  return result;
}

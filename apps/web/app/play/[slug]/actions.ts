"use server";

import { addXp, payout, RESULT_XP_BONUS, scoreTarget } from "@playloop/economy";
import { playRules, validatePlay, type PlayableType } from "@playloop/games";
import { getDb, schema } from "@playloop/db";
import { and, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/session";

/**
 * Opens a play session for `gameId`: abandons this profile's other still-open
 * sessions (only one live session per player at a time) and inserts a new
 * 'started' row, whose server-recorded startedAt is what submitPlay checks
 * elapsed time against. Call this right before mounting the game engine.
 */
export async function startPlay(gameId: string): Promise<{ sessionId: string }> {
  const session = await requireSession();
  const db = getDb();

  const game = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .then((r) => r[0]);
  if (!game) throw new Error("Game not found");

  const [row] = await db.transaction(async (tx) => {
    await tx
      .update(schema.playSessions)
      .set({ status: "abandoned" })
      .where(and(eq(schema.playSessions.profileId, session.sub), eq(schema.playSessions.status, "started")));

    return tx.insert(schema.playSessions).values({ profileId: session.sub, gameId: game.id }).returning();
  });

  return { sessionId: row!.id };
}

export interface PlayResult {
  score: number;
  payoutPoints: number;
  xpGain: number;
  level: number;
  levelsGained: number;
  pointsBalance: number;
}

/**
 * Records a completed play session. Unlike a plain "trust the client" score
 * submission, this only credits points for a session the server itself
 * issued (via startPlay) and only once per session:
 *
 *  1. Atomically claim the session — the conditional UPDATE below only
 *     matches a row that's still 'started' and belongs to this profile, so
 *     a replayed/duplicate submitPlay call for the same session fails here
 *     (status no longer 'started') rather than double-crediting.
 *  2. Validate the claimed score against @playloop/games' playRules, using
 *     server time (claimed.startedAt) for elapsed seconds — a submission
 *     that's too fast, too old, or implausibly high-scoring for the
 *     template/difficulty is rejected and flips the session to 'rejected'
 *     with a reason, crediting nothing.
 *  3. Otherwise: payout via @playloop/economy (same formula as before),
 *     ledger entry, and pointsBalance updated with SQL-side arithmetic
 *     (`pointsBalance + payoutPoints` in the UPDATE itself, not a JS-computed
 *     value written back) so a concurrent redemption debit or another play
 *     credit can't clobber it. xp/level are still computed in JS from a
 *     fresh read — an acceptable simplification, since unlike points they
 *     aren't spent by anything else yet.
 *
 * Still deferred: signed per-event telemetry / server-side replay of the
 * actual gameplay, and Upstash rate limiting — see the play_sessions
 * schema comment.
 */
export async function submitPlay(sessionId: string, rawScore: number): Promise<PlayResult> {
  const session = await requireSession();
  const score = Math.max(0, Math.round(rawScore));
  const db = getDb();

  // Drizzle/Postgres rolls back the *entire* transaction if anything inside
  // it throws — including a write we want to keep, like marking a rejected
  // session 'rejected'. So the transaction below never throws; it returns an
  // { ok } discriminated outcome, and we only throw after it has committed.
  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.playSessions)
      .set({ status: "completed", completedAt: sql`now()` })
      .where(
        and(
          eq(schema.playSessions.id, sessionId),
          eq(schema.playSessions.profileId, session.sub),
          eq(schema.playSessions.status, "started"),
        ),
      )
      .returning();
    if (!claimed) return { ok: false as const, error: "This play session was already used or doesn't exist." };

    const game = await tx
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, claimed.gameId))
      .then((r) => r[0]);
    if (!game) return { ok: false as const, error: "Game not found." };

    const config = (game.config ?? {}) as { questions?: unknown[] };
    const type = game.type as PlayableType;
    const questionCount = type === "quiz" ? (config.questions?.length ?? 1) : undefined;

    const elapsedSeconds = (Date.now() - claimed.startedAt.getTime()) / 1000;
    const rules = playRules(type, { difficulty: game.difficulty, questionCount });
    const verdict = validatePlay({ elapsedSeconds, score }, rules);

    if (!verdict.ok) {
      await tx
        .update(schema.playSessions)
        .set({ status: "rejected", rejectReason: verdict.reason })
        .where(eq(schema.playSessions.id, sessionId));
      return { ok: false as const, error: "That play couldn't be verified, so no points were awarded. Please try again." };
    }

    const target = scoreTarget(type, questionCount);
    const payoutPoints = payout(game.maxPoints, score, target);
    const xpGain = payoutPoints + RESULT_XP_BONUS;

    const profile = await tx
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, session.sub))
      .then((r) => r[0]);
    if (!profile) return { ok: false as const, error: "Profile not found." };
    const xpResult = addXp({ xp: profile.xp, level: profile.level }, xpGain);

    await tx
      .update(schema.playSessions)
      .set({ score, payoutPoints, xpAwarded: xpGain })
      .where(eq(schema.playSessions.id, sessionId));

    await tx.insert(schema.ledgerEntries).values({
      profileId: profile.id,
      delta: payoutPoints,
      reason: `Played ${game.title}`,
      refType: "play_session",
      refId: sessionId,
    });

    const [updatedProfile] = await tx
      .update(schema.profiles)
      .set({
        xp: xpResult.xp,
        level: xpResult.level,
        pointsBalance: sql`${schema.profiles.pointsBalance} + ${payoutPoints}`,
      })
      .where(eq(schema.profiles.id, profile.id))
      .returning({ pointsBalance: schema.profiles.pointsBalance });

    await tx
      .update(schema.games)
      .set({ playCount: sql`${schema.games.playCount} + 1` })
      .where(eq(schema.games.id, game.id));

    return {
      ok: true as const,
      score,
      payoutPoints,
      xpGain,
      level: xpResult.level,
      levelsGained: xpResult.levelsGained,
      pointsBalance: updatedProfile!.pointsBalance,
    };
  });

  if (!outcome.ok) throw new Error(outcome.error);
  const { ok: _ok, ...result } = outcome;
  return result;
}

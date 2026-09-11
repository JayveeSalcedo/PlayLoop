"use server";

import { addXp, payout, RESULT_XP_BONUS, scoreTarget } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export interface PlayResult {
  score: number;
  payoutPoints: number;
  xpGain: number;
  level: number;
  levelsGained: number;
  pointsBalance: number;
}

/**
 * Records a completed play session: computes the payout server-side (via
 * @playloop/economy, the same formula the prototype used) and writes the
 * ledger entry, XP/level, and play_session row in one transaction.
 *
 * MVP trust boundary: `rawScore` is reported by the client-run game engine.
 * There is no server-issued play token or timing check yet — see the
 * play_sessions table comment and the plan's deferred-Upstash note.
 */
export async function submitPlay(gameId: string, rawScore: number): Promise<PlayResult> {
  const session = await requireSession();
  const score = Math.max(0, Math.round(rawScore));
  const db = getDb();

  return db.transaction(async (tx) => {
    const game = await tx
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, gameId))
      .then((r) => r[0]);
    if (!game) throw new Error("Game not found");

    const profile = await tx
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, session.sub))
      .then((r) => r[0]);
    if (!profile) throw new Error("Profile not found");

    const config = (game.config ?? {}) as { questions?: unknown[] };
    const questionCount = game.type === "quiz" ? (config.questions?.length ?? 1) : undefined;
    const target = scoreTarget(game.type as "quiz" | "catch" | "memory" | "reflex", questionCount);
    const payoutPoints = payout(game.maxPoints, score, target);
    const xpGain = payoutPoints + RESULT_XP_BONUS;
    const xpResult = addXp({ xp: profile.xp, level: profile.level }, xpGain);
    const pointsBalance = profile.pointsBalance + payoutPoints;

    const [playSession] = await tx
      .insert(schema.playSessions)
      .values({ profileId: profile.id, gameId: game.id, score, payoutPoints, xpAwarded: xpGain })
      .returning();

    await tx.insert(schema.ledgerEntries).values({
      profileId: profile.id,
      delta: payoutPoints,
      reason: `Played ${game.title}`,
      refType: "play_session",
      refId: playSession!.id,
    });

    await tx
      .update(schema.profiles)
      .set({ xp: xpResult.xp, level: xpResult.level, pointsBalance })
      .where(eq(schema.profiles.id, profile.id));

    await tx
      .update(schema.games)
      .set({ playCount: game.playCount + 1 })
      .where(eq(schema.games.id, game.id));

    return {
      score,
      payoutPoints,
      xpGain,
      level: xpResult.level,
      levelsGained: xpResult.levelsGained,
      pointsBalance,
    };
  });
}

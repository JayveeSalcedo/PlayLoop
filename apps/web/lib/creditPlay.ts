/**
 * Credits a play that has already been verified: payout, XP, the ledger entry,
 * the cached balance, play count, challenge resolution and the referral bonus.
 *
 * Shared by both engines. A template game is checked against its analytic
 * rules (submitPlay in app/play/[slug]/actions.ts); a code game is checked by
 * replaying it (app/api/play/[sessionId]/submit/route.ts). How a play gets
 * verified differs; what an accepted play is *worth* must not, so this is the
 * one place it's decided.
 *
 * Moved verbatim from submitPlay. Rules that still hold here:
 *  - Call it inside the transaction that marked the session completed, after
 *    verification passed.
 *  - Balance changes use SQL-side arithmetic (`pointsBalance + n` in the
 *    UPDATE), never a JS-computed value written back, so a concurrent
 *    redemption debit or another credit can't clobber them.
 *  - It only ever returns, never throws: Drizzle rolls back the *whole*
 *    transaction on a throw, including the session status we want to keep.
 */
import {
  addXp,
  CHALLENGE_WIN_BONUS,
  challengeOutcome,
  payout,
  REFERRAL_JOIN_BONUS,
  RESULT_XP_BONUS,
  type ChallengeOutcome,
} from "@playloop/economy";
import { schema, type Tx } from "@playloop/db";
import { and, count, eq, sql } from "drizzle-orm";

export interface PlayResult {
  score: number;
  payoutPoints: number;
  xpGain: number;
  level: number;
  levelsGained: number;
  pointsBalance: number;
  /** Set only if this play fulfilled a challenge (started via startChallengedPlay). */
  challengeResult?: { outcome: ChallengeOutcome; opponentScore: number; bonusAwarded: number };
}

export type CreditOutcome = ({ ok: true } & PlayResult) | { ok: false; error: string };

export async function creditVerifiedPlay(
  tx: Tx,
  args: {
    sessionId: string;
    profileId: string;
    game: { id: string; title: string; maxPoints: number };
    /** The verified score — for a code game, the replay's, never the client's claim. */
    score: number;
    /** Score that earns the full maxPoints. 0 or less pays payout()'s flat floor. */
    target: number;
    challengeId: string | null;
  },
): Promise<CreditOutcome> {
  const { sessionId, profileId, game, score, target, challengeId } = args;

  const payoutPoints = payout(game.maxPoints, score, target);
  const xpGain = payoutPoints + RESULT_XP_BONUS;

  const profile = await tx
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .then((r) => r[0]);
  if (!profile) return { ok: false, error: "Profile not found." };
  // Closes the window where someone is suspended mid-play: startPlay already
  // refuses a suspended account, but a session issued a minute earlier would
  // otherwise still pay out. Free to check here — the row is already loaded.
  if (profile.suspendedAt) {
    return { ok: false, error: "This account is suspended, so that play earned nothing." };
  }
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

  let pointsBalance = updatedProfile!.pointsBalance;
  let challengeResult: PlayResult["challengeResult"];

  // Challenge fulfillment, if this session was started via startChallengedPlay.
  if (challengeId) {
    const challenge = await tx
      .select()
      .from(schema.challenges)
      .where(and(eq(schema.challenges.id, challengeId), eq(schema.challenges.status, "pending")))
      .then((r) => r[0]);
    // If missing/already completed (e.g. a race from two tabs), skip silently — no error, no double resolution.
    if (challenge) {
      const result = challengeOutcome(challenge.senderScore, score);
      const winnerId = result === "tie" ? null : result === "sender" ? challenge.senderId : profileId;

      await tx
        .update(schema.challenges)
        .set({
          status: "completed",
          recipientId: profileId,
          recipientPlaySessionId: sessionId,
          winnerId,
          completedAt: sql`now()`,
        })
        .where(eq(schema.challenges.id, challenge.id));

      let bonusAwarded = 0;
      if (winnerId) {
        await tx.insert(schema.ledgerEntries).values({
          profileId: winnerId,
          delta: CHALLENGE_WIN_BONUS,
          reason: winnerId === profileId ? `Beat ${challenge.senderScore} in a challenge` : "Won a challenge",
          refType: "challenge",
          refId: challenge.id,
        });
        const [winnerProfile] = await tx
          .update(schema.profiles)
          .set({ pointsBalance: sql`${schema.profiles.pointsBalance} + ${CHALLENGE_WIN_BONUS}` })
          .where(eq(schema.profiles.id, winnerId))
          .returning({ pointsBalance: schema.profiles.pointsBalance });
        if (winnerId === profileId) {
          pointsBalance = winnerProfile!.pointsBalance;
          bonusAwarded = CHALLENGE_WIN_BONUS;
        }
      }

      challengeResult = { outcome: result, opponentScore: challenge.senderScore, bonusAwarded };
    }
  }

  // Referral bonus — fires at most once per profile, the first time they ever complete a play.
  if (profile.referredByChallengeId) {
    const completedRows = await tx
      .select({ n: count() })
      .from(schema.playSessions)
      .where(and(eq(schema.playSessions.profileId, profile.id), eq(schema.playSessions.status, "completed")));
    const completedCount = completedRows[0]?.n ?? 0;

    if (completedCount === 1) {
      const referralChallenge = await tx
        .select({ senderId: schema.challenges.senderId })
        .from(schema.challenges)
        .where(eq(schema.challenges.id, profile.referredByChallengeId))
        .then((r) => r[0]);
      if (referralChallenge) {
        await tx.insert(schema.ledgerEntries).values({
          profileId: referralChallenge.senderId,
          delta: REFERRAL_JOIN_BONUS,
          reason: "Friend joined from your challenge",
          refType: "profile",
          refId: profile.id,
        });
        await tx
          .update(schema.profiles)
          .set({ pointsBalance: sql`${schema.profiles.pointsBalance} + ${REFERRAL_JOIN_BONUS}` })
          .where(eq(schema.profiles.id, referralChallenge.senderId));
      }
    }
  }

  return {
    ok: true,
    score,
    payoutPoints,
    xpGain,
    level: xpResult.level,
    levelsGained: xpResult.levelsGained,
    pointsBalance,
    challengeResult,
  };
}

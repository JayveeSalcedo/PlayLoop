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
  /**
   * True when the profile that just earned this is still an unclaimed guest
   * (see profiles.isGuest) — the result screen uses this to show "log in to
   * claim your reward" instead of the normal share/home actions.
   */
  isGuest: boolean;
  /** Score target for full payout, used to calculate 1-3 star performance rating */
  target: number;
  /** True if this score is strictly greater than the player's previous best on this game */
  isPersonalBest: boolean;
}

export type CreditOutcome =
  | ({ ok: true } & PlayResult)
  | {
      ok: false;
      error: string;
      /**
       * Set only for outcomes the play UI should recover from gracefully
       * (show the score, offer a specific next step) rather than treat as a
       * generic failure — see submitPlay and the /api/play submit route,
       * which both pass this straight through to the client.
       */
      reason?: "guest_cap";
    };

/**
 * Credits REFERRAL_JOIN_BONUS to whoever's challenge link brought `profile`
 * in, the first time `profile` ever completes a play — at most once per
 * profile, ever.
 *
 * Split out of creditVerifiedPlay so login/verify/actions.ts can call it
 * again, unchanged, at the moment a guest profile claims a real email: a
 * guest's first completed play does NOT pay this out (creditVerifiedPlay
 * skips it while isGuest is true) specifically so nobody can farm it by
 * spamming challenge links and never verifying an email — it only fires once
 * a human has actually proven the referral by claiming the account.
 */
export async function maybeAwardReferralBonus(tx: Tx, profile: { id: string; referredByChallengeId: string | null }) {
  if (!profile.referredByChallengeId) return;

  const completedRows = await tx
    .select({ n: count() })
    .from(schema.playSessions)
    .where(and(eq(schema.playSessions.profileId, profile.id), eq(schema.playSessions.status, "completed")));
  const completedCount = completedRows[0]?.n ?? 0;
  if (completedCount !== 1) return;

  const referralChallenge = await tx
    .select({ senderId: schema.challenges.senderId })
    .from(schema.challenges)
    .where(eq(schema.challenges.id, profile.referredByChallengeId))
    .then((r) => r[0]);
  if (!referralChallenge) return;

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

  // Guest daily earning cap — prevents farming before account verification.
  // Matches the prototype's DAY_CAP = 2000.
  if (profile.isGuest) {
    const { GUEST_DAILY_CAP } = await import("@playloop/economy");
    const earnedRows = await tx
      .select({
        earned: sql<number>`coalesce(sum(${schema.ledgerEntries.delta}), 0)`,
      })
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.profileId, profile.id),
          sql`${schema.ledgerEntries.createdAt}::date = current_date`,
          sql`${schema.ledgerEntries.delta} > 0`,
        ),
      );
    const earned = earnedRows[0]?.earned ?? 0;
    if (earned >= GUEST_DAILY_CAP) {
      return { ok: false, reason: "guest_cap", error: "Daily limit reached. Save your progress to keep earning." };
    }
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

      // Auto-add as friends after completing a challenge together.
      const { ensureFriendship } = await import("@/lib/friends");
      await ensureFriendship(tx, challenge.senderId, profileId);
    }
  }

  // Referral bonus — skipped for a still-unclaimed guest (see
  // maybeAwardReferralBonus's doc comment); awarded instead the moment they
  // claim the account in login/verify/actions.ts.
  if (!profile.isGuest) {
    await maybeAwardReferralBonus(tx, profile);
  }

  // Check if this is a personal best for this player on this game.
  const prevBestRow = await tx
    .select({ maxScore: sql<number>`coalesce(max(${schema.playSessions.score}), 0)` })
    .from(schema.playSessions)
    .where(
      and(
        eq(schema.playSessions.profileId, profile.id),
        eq(schema.playSessions.gameId, game.id),
        eq(schema.playSessions.status, "completed"),
        sql`${schema.playSessions.id} != ${sessionId}`,
      ),
    );
  const prevBest = prevBestRow[0]?.maxScore ?? 0;
  const isPersonalBest = score > 0 && score > prevBest;

  return {
    ok: true,
    score,
    payoutPoints,
    xpGain,
    level: xpResult.level,
    levelsGained: xpResult.levelsGained,
    pointsBalance,
    challengeResult,
    isGuest: profile.isGuest,
    target,
    isPersonalBest,
  };
}

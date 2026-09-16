"use server";

import { addXp, CHALLENGE_WIN_BONUS, challengeOutcome, payout, REFERRAL_JOIN_BONUS, RESULT_XP_BONUS, scoreTarget, type ChallengeOutcome } from "@playloop/economy";
import { playRules, validatePlay, type PlayableType } from "@playloop/games";
import { getDb, schema } from "@playloop/db";
import { and, count, eq, sql } from "drizzle-orm";
import type { Tx } from "@playloop/db";
import { requireActiveProfile } from "@/lib/profile";
import { requireSession } from "@/lib/session";

/** Shared by startPlay/startChallengedPlay: abandon this profile's other still-open sessions, then insert a new one. */
async function insertStartedSession(
  tx: Tx,
  profileId: string,
  gameId: string,
  challengeId?: string,
): Promise<{ id: string }> {
  await tx
    .update(schema.playSessions)
    .set({ status: "abandoned" })
    .where(and(eq(schema.playSessions.profileId, profileId), eq(schema.playSessions.status, "started")));

  const [row] = await tx
    .insert(schema.playSessions)
    .values({ profileId, gameId, challengeId })
    .returning({ id: schema.playSessions.id });
  return row!;
}

/**
 * Opens a play session for `gameId`: abandons this profile's other still-open
 * sessions (only one live session per player at a time) and inserts a new
 * 'started' row, whose server-recorded startedAt is what submitPlay checks
 * elapsed time against. Call this right before mounting the game engine.
 */
export async function startPlay(gameId: string): Promise<{ sessionId: string }> {
  const db = getDb();

  // Both round-trips at once — they don't depend on each other, and against a
  // ~90ms Seoul round-trip that's the difference between 90ms and 180ms.
  const [{ session }, game] = await Promise.all([
    requireActiveProfile(),
    db
      .select({ id: schema.games.id, status: schema.games.status })
      .from(schema.games)
      .where(eq(schema.games.id, gameId))
      .then((r) => r[0]),
  ]);
  if (!game) throw new Error("Game not found");
  // A creator can open their own unpublished game's page, so this is the check
  // that stops them earning points on a game nobody has reviewed yet.
  if (game.status !== "published") throw new Error("That game isn't approved for play yet.");

  const row = await db.transaction((tx) => insertStartedSession(tx, session.sub, game.id));
  return { sessionId: row.id };
}

/**
 * Like startPlay, but ties the new session to a challenge (see
 * packages/db/src/schema.ts's `challenges` table). Validated up front,
 * before any write, same style as redeemReward's pre-transaction checks —
 * nothing's been written yet at this point, so a plain throw is fine.
 */
export async function startChallengedPlay(gameId: string, challengeCode: string): Promise<{ sessionId: string }> {
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
    .select({ status: schema.games.status })
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .then((r) => r[0]);
  if (game?.status !== "published") throw new Error("That game isn't available to play right now.");

  const row = await db.transaction((tx) => insertStartedSession(tx, session.sub, gameId, challenge.id));
  return { sessionId: row.id };
}

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
 *     an elapsed-seconds figure computed entirely DB-side (`now() -
 *     started_at`, in the claim query itself) so app-server/DB clock skew
 *     can't skew it — a submission that's too fast, too old, or implausibly
 *     high-scoring for the template/difficulty is rejected and flips the
 *     session to 'rejected' with a reason, crediting nothing.
 *  3. Otherwise: payout via @playloop/economy (same formula as before),
 *     ledger entry, and pointsBalance updated with SQL-side arithmetic
 *     (`pointsBalance + payoutPoints` in the UPDATE itself, not a JS-computed
 *     value written back) so a concurrent redemption debit or another play
 *     credit can't clobber it. xp/level are still computed in JS from a
 *     fresh read — an acceptable simplification, since unlike points they
 *     aren't spent by anything else yet.
 *  4. If this session fulfills a challenge (claimed.challengeId is set):
 *     resolve the challenge (outcome, winner) and, if there's a winner (not
 *     a tie), credit CHALLENGE_WIN_BONUS to whichever profile actually won —
 *     which may be the OTHER profile (the sender), not this one. That's new
 *     relative to the rest of this function (which otherwise only ever
 *     touches the calling profile's row), but it's mechanically identical:
 *     one more conditional/unconditional UPDATE by id, no new race.
 *  5. If this is this profile's first-ever completed play and they were
 *     referred via a challenge, credit REFERRAL_JOIN_BONUS to whoever sent
 *     that challenge. Naturally idempotent with no extra flag column: the
 *     completed-play count (which already includes the row this function
 *     just wrote) can only equal 1 once in a profile's lifetime.
 *
 * Steps 4-5 are additive side effects appended after the core payout logic
 * already succeeded — like everything else in this transaction, they only
 * ever return, never throw, preserving the "throw after commit, not during"
 * rule below (Drizzle/Postgres rolls back the *entire* transaction if
 * anything inside it throws, including writes we want to keep).
 *
 * Still deferred: signed per-event telemetry / server-side replay of the
 * actual gameplay, and Upstash rate limiting — see the play_sessions
 * schema comment.
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
    // This path scores template games only: playRules is a switch over the four
    // templates, so a null type would fall through it and return undefined
    // rules, and validatePlay would then read undefined ceilings — paying out on
    // a play nothing actually checked. Code games are scored by replaying them
    // instead; refuse here rather than guess.
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

    const target = scoreTarget(type, questionCount);
    const payoutPoints = payout(game.maxPoints, score, target);
    const xpGain = payoutPoints + RESULT_XP_BONUS;

    const profile = await tx
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, session.sub))
      .then((r) => r[0]);
    if (!profile) return { ok: false as const, error: "Profile not found." };
    // Closes the window where someone is suspended mid-play: startPlay already
    // refuses a suspended account, but a session issued a minute earlier would
    // otherwise still pay out. Free to check here — the row is already loaded.
    if (profile.suspendedAt) {
      return { ok: false as const, error: "This account is suspended, so that play earned nothing." };
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

    // Step 4: challenge fulfillment, if this session was started via startChallengedPlay.
    if (claimed.challengeId) {
      const challenge = await tx
        .select()
        .from(schema.challenges)
        .where(and(eq(schema.challenges.id, claimed.challengeId), eq(schema.challenges.status, "pending")))
        .then((r) => r[0]);
      // If missing/already completed (e.g. a race from two tabs), skip silently — no error, no double resolution.
      if (challenge) {
        const result = challengeOutcome(challenge.senderScore, score);
        const winnerId = result === "tie" ? null : result === "sender" ? challenge.senderId : session.sub;

        await tx
          .update(schema.challenges)
          .set({
            status: "completed",
            recipientId: session.sub,
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
            reason: winnerId === session.sub ? `Beat ${challenge.senderScore} in a challenge` : "Won a challenge",
            refType: "challenge",
            refId: challenge.id,
          });
          const [winnerProfile] = await tx
            .update(schema.profiles)
            .set({ pointsBalance: sql`${schema.profiles.pointsBalance} + ${CHALLENGE_WIN_BONUS}` })
            .where(eq(schema.profiles.id, winnerId))
            .returning({ pointsBalance: schema.profiles.pointsBalance });
          if (winnerId === session.sub) {
            pointsBalance = winnerProfile!.pointsBalance;
            bonusAwarded = CHALLENGE_WIN_BONUS;
          }
        }

        challengeResult = { outcome: result, opponentScore: challenge.senderScore, bonusAwarded };
      }
    }

    // Step 5: referral bonus — fires at most once per profile, the first time they ever complete a play.
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
      ok: true as const,
      score,
      payoutPoints,
      xpGain,
      level: xpResult.level,
      levelsGained: xpResult.levelsGained,
      pointsBalance,
      challengeResult,
    };
  });

  if (!outcome.ok) throw new Error(outcome.error);
  const { ok: _ok, ...result } = outcome;
  return result;
}

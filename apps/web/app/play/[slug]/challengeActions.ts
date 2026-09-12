"use server";

import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { generateChallengeCode } from "@/lib/challengeCode";
import { requireSession } from "@/lib/session";

/**
 * Turns a completed play into a shareable challenge link. Pre-transaction
 * validation only (nothing's been written yet), same style as
 * redeemReward's reward-not-found checks — a plain throw is fine here.
 *
 * Returns just the code; the client builds the shareable URL from
 * window.location.origin, so no NEXT_PUBLIC_APP_URL env var is needed.
 */
export async function createChallenge(sessionId: string): Promise<{ code: string }> {
  const session = await requireSession();
  const db = getDb();

  const playSession = await db
    .select()
    .from(schema.playSessions)
    .where(eq(schema.playSessions.id, sessionId))
    .then((r) => r[0]);
  if (!playSession || playSession.profileId !== session.sub) throw new Error("Play not found.");
  if (playSession.status !== "completed" || playSession.score == null) {
    throw new Error("Only a completed play can be challenged from.");
  }

  const code = generateChallengeCode();
  await db.insert(schema.challenges).values({
    code,
    senderId: session.sub,
    gameId: playSession.gameId,
    senderPlaySessionId: playSession.id,
    senderScore: playSession.score,
  });

  return { code };
}

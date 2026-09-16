/**
 * Opening a play session, shared by every way one starts: a real play, a
 * challenged play, and a creator's studio test play.
 */
import { schema, type Tx } from "@playloop/db";
import { and, eq, isNull } from "drizzle-orm";

/** What a code game's session is pinned to. Null for a template game. */
export type CodePin = { gameVersionId: string; seed: string } | null;

/**
 * Abandons this profile's other still-open sessions (one live session per
 * player at a time), then inserts a new 'started' one whose server-recorded
 * startedAt is what submission checks elapsed time against.
 */
export async function insertStartedSession(
  tx: Tx,
  input: { profileId: string; gameId: string; pin: CodePin; challengeId?: string; isTest?: boolean },
): Promise<{ id: string }> {
  await tx
    .update(schema.playSessions)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(schema.playSessions.profileId, input.profileId),
        eq(schema.playSessions.status, "started"),
        // A code-game session that's mid-verification has already been
        // submitted; abandoning it would throw away a play the server is
        // still checking. Template sessions never set this, so they're
        // unaffected.
        isNull(schema.playSessions.verifyingAt),
      ),
    );

  const [row] = await tx
    .insert(schema.playSessions)
    .values({
      profileId: input.profileId,
      gameId: input.gameId,
      challengeId: input.challengeId,
      gameVersionId: input.pin?.gameVersionId,
      seed: input.pin?.seed,
      isTest: input.isTest ?? false,
    })
    .returning({ id: schema.playSessions.id });
  return row!;
}

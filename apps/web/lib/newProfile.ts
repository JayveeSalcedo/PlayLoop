import { WELCOME_GIFT_BONUS } from "@playloop/economy";
import { schema, type Tx } from "@playloop/db";
import { eq } from "drizzle-orm";

export type Profile = typeof schema.profiles.$inferSelect;

/**
 * Inserts a brand-new profile and grants the welcome gift, atomically. Shared
 * by the normal OTP signup path (login/verify/actions.ts) and the silent
 * guest profile a challenge link creates before login
 * (app/c/[code]/actions.ts) — both are, economically, someone's first-ever
 * signup, just verified at different times.
 *
 * Call inside a transaction the caller owns (so a failure here rolls back
 * with everything else), and pass it as `tx`.
 */
export async function createNewProfile(
  tx: Tx,
  args: { email: string; isGuest?: boolean; referredByChallengeId?: string; name?: string | null },
): Promise<Profile> {
  const [created] = await tx
    .insert(schema.profiles)
    .values({
      email: args.email,
      isGuest: args.isGuest ?? false,
      referredByChallengeId: args.referredByChallengeId,
      name: args.name !== undefined ? args.name : (args.isGuest ? "Guest Player" : null),
    })
    .returning();
  await tx.insert(schema.ledgerEntries).values({
    profileId: created!.id,
    delta: WELCOME_GIFT_BONUS,
    reason: "Welcome gift",
  });
  const [updated] = await tx
    .update(schema.profiles)
    .set({ pointsBalance: WELCOME_GIFT_BONUS })
    .where(eq(schema.profiles.id, created!.id))
    .returning();
  return updated!;
}

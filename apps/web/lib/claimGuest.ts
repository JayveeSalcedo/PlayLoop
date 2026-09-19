import { xpNeed } from "@playloop/economy";
import { schema, type Tx } from "@playloop/db";
import { eq, sql } from "drizzle-orm";
import { maybeAwardReferralBonus } from "./creditPlay";

/**
 * The rare case in login/verify/actions.ts where a guest profile (created
 * silently by a challenge link, see app/c/[code]/actions.ts) tries to claim
 * an email that already belongs to a *different*, real account — e.g.
 * someone who already had a PlayLoop account opened a friend's link in a
 * private tab, played as a guest, then logged in with the email they
 * actually use.
 *
 * Rather than log them into the existing account and quietly strand the
 * guest's earnings (or refuse the login, which is worse), this moves what
 * the guest earned onto the real account: its points balance (via a ledger
 * entry, so it stays auditable), its XP, and the challenge play it just
 * completed (repointed so the challenge and the real account's own play
 * history agree on who played it). Returns the real (target) profile,
 * refreshed.
 *
 * The referral bonus, if this guest's play qualifies, is evaluated here too
 * — against the guest's own completed-play count, before that session gets
 * repointed away from it — for the same reason a normal claim awards it now
 * rather than at play time (see maybeAwardReferralBonus).
 *
 * The guest row itself is left in place, suspended, rather than deleted: its
 * synthetic email can never be logged into again anyway, and play_sessions
 * historically pointed at it (via ref rows/log tables) stay valid.
 */
export async function mergeGuestIntoProfile(tx: Tx, guestProfileId: string, targetProfileId: string) {
  const guest = await tx.select().from(schema.profiles).where(eq(schema.profiles.id, guestProfileId)).then((r) => r[0]);
  if (!guest) throw new Error("Guest profile not found.");

  await maybeAwardReferralBonus(tx, guest);

  await tx.update(schema.playSessions).set({ profileId: targetProfileId }).where(eq(schema.playSessions.profileId, guestProfileId));
  await tx.update(schema.challenges).set({ recipientId: targetProfileId }).where(eq(schema.challenges.recipientId, guestProfileId));
  await tx.update(schema.challenges).set({ winnerId: targetProfileId }).where(eq(schema.challenges.winnerId, guestProfileId));

  if (guest.pointsBalance > 0) {
    await tx.insert(schema.ledgerEntries).values({
      profileId: targetProfileId,
      delta: guest.pointsBalance,
      reason: "Claimed a guest play",
      refType: "profile",
      refId: guest.id,
    });
  }

  // guest.xp is xp *within its current level* (addXp rolls over on level-up),
  // so reconstruct the lifetime total it earned before adding it to target.
  let guestTotalXp = guest.xp;
  for (let level = 1; level < guest.level; level++) guestTotalXp += xpNeed(level);

  const target = await tx.select().from(schema.profiles).where(eq(schema.profiles.id, targetProfileId)).then((r) => r[0]);
  if (!target) throw new Error("Target profile not found.");

  let xp = target.xp + guestTotalXp;
  let level = target.level;
  while (xp >= xpNeed(level)) {
    xp -= xpNeed(level);
    level += 1;
  }

  const [updatedTarget] = await tx
    .update(schema.profiles)
    .set({
      xp,
      level,
      // SQL-side, like every other balance change here — never a JS-read
      // value written back, so a concurrent redemption debit can't be lost.
      pointsBalance: sql`${schema.profiles.pointsBalance} + ${guest.pointsBalance}`,
    })
    .where(eq(schema.profiles.id, targetProfileId))
    .returning();

  await tx
    .update(schema.profiles)
    .set({ pointsBalance: 0, xp: 0, level: 1, suspendedAt: new Date(), suspendedReason: "Merged into another account after claiming" })
    .where(eq(schema.profiles.id, guestProfileId));

  return updatedTarget!;
}

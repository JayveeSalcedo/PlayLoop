"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

const NOTES_MAX = 500;

/**
 * Records a decision on a pending game: flips games.status and closes out the
 * matching moderation_reviews row in one transaction.
 *
 * Both updates are conditional on the state they expect to find ('pending_review'
 * / 'pending') rather than on a row read beforehand. Two admins working the
 * queue at the same time would otherwise both read "pending", both think they
 * won, and write two decisions over each other — Postgres evaluates these
 * WHERE clauses against the row at write time, so exactly one of them matches.
 */
async function decide(
  gameId: string,
  outcome: "approved" | "rejected",
  notes: string | null,
): Promise<{ title: string }> {
  const { profile } = await requireAdmin();
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [game] = await tx
      .update(schema.games)
      .set({ status: outcome === "approved" ? "published" : "rejected" })
      .where(and(eq(schema.games.id, gameId), eq(schema.games.status, "pending_review")))
      .returning({ title: schema.games.title });

    if (!game) {
      return { ok: false as const, error: "That game isn't waiting for review any more — someone may have just decided it." };
    }

    await tx
      .update(schema.moderationReviews)
      .set({ outcome, notes, reviewerId: profile.id, decidedAt: sql`now()` })
      .where(
        and(eq(schema.moderationReviews.gameId, gameId), eq(schema.moderationReviews.outcome, "pending")),
      );

    return { ok: true as const, title: game.title };
  });

  if (!result.ok) throw new Error(result.error);

  revalidatePath("/admin");
  revalidatePath("/feed");
  return { title: result.title };
}

/**
 * Confirms a brand's payment arrived, which is what makes a campaign real —
 * campaignStatus() reports "draft" until fundedAt is set, whatever its dates
 * say. This is the admin-confirmed checkbox that stands in for Stripe; there is
 * no payment integration, deliberately (see the plan).
 *
 * Conditional on still being unfunded, so two admins can't both "confirm" it.
 */
export async function markCampaignFunded(campaignId: string): Promise<{ ok: true }> {
  const { profile: _admin } = await requireAdmin();
  const db = getDb();

  const [funded] = await db
    .update(schema.campaigns)
    .set({ fundedAt: sql`now()` })
    .where(
      and(
        eq(schema.campaigns.id, campaignId),
        isNull(schema.campaigns.fundedAt),
        isNull(schema.campaigns.cancelledAt),
      ),
    )
    .returning({ id: schema.campaigns.id });

  if (!funded) throw new Error("That campaign is already funded, or it's been cancelled.");

  revalidatePath("/admin");
  revalidatePath("/brand");
  return { ok: true };
}

export async function approveGame(gameId: string): Promise<{ title: string }> {
  return decide(gameId, "approved", null);
}

export async function rejectGame(gameId: string, notes: string): Promise<{ title: string }> {
  // Pre-transaction validation — nothing written yet, so a plain throw is right.
  const reason = String(notes ?? "").trim();
  if (!reason) throw new Error("Give the creator a reason — they can't fix what they can't see.");

  return decide(gameId, "rejected", reason.slice(0, NOTES_MAX));
}

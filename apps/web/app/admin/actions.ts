"use server";

import { getDb, schema } from "@playloop/db";
import { formatAed } from "@playloop/economy";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAdminAction } from "@/lib/adminLog";

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
      .returning({ title: schema.games.title, gameKind: schema.games.gameKind, currentVersionId: schema.games.currentVersionId });

    if (!game) {
      return { ok: false as const, error: "That game isn't waiting for review any more — someone may have just decided it." };
    }

    // Mirrors the decision onto the version actually reviewed. Without this,
    // game_versions.status would stay 'pending_review' forever after this
    // point — wrong on its face, and the schema's own reason for the column
    // (reverting to a version already approved shouldn't need re-review) only
    // holds if the outcome is recorded here, on the version, not just on the
    // game.
    if (game.gameKind === "code" && game.currentVersionId) {
      await tx
        .update(schema.gameVersions)
        .set({ status: outcome === "approved" ? "published" : "rejected" })
        .where(eq(schema.gameVersions.id, game.currentVersionId));
    }

    await tx
      .update(schema.moderationReviews)
      .set({ outcome, notes, reviewerId: profile.id, decidedAt: sql`now()` })
      .where(
        and(eq(schema.moderationReviews.gameId, gameId), eq(schema.moderationReviews.outcome, "pending")),
      );

    await recordAdminAction(tx, {
      actorProfileId: profile.id,
      action: outcome === "approved" ? "game.approve" : "game.reject",
      targetType: "game",
      targetId: gameId,
      summary: `${outcome === "approved" ? "Approved" : "Rejected"} "${game.title}"`,
      details: notes ? { notes } : {},
    });

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
  const { profile: admin } = await requireAdmin();
  const db = getDb();

  const outcome = await db.transaction(async (tx) => {
    const [funded] = await tx
      .update(schema.campaigns)
      .set({ fundedAt: sql`now()` })
      .where(
        and(
          eq(schema.campaigns.id, campaignId),
          isNull(schema.campaigns.fundedAt),
          isNull(schema.campaigns.cancelledAt),
        ),
      )
      .returning({ id: schema.campaigns.id, budgetFils: schema.campaigns.budgetFils });

    if (!funded) {
      return { ok: false as const, error: "That campaign is already funded, or it's been cancelled." };
    }

    // Money confirmed with no payment processor behind it, so who said so is
    // the only record that it happened at all.
    await recordAdminAction(tx, {
      actorProfileId: admin.id,
      action: "campaign.fund",
      targetType: "campaign",
      targetId: campaignId,
      summary: `Confirmed funding of ${formatAed(funded.budgetFils)}`,
      details: { budgetFils: funded.budgetFils },
    });

    return { ok: true as const };
  });

  if (!outcome.ok) throw new Error(outcome.error);

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

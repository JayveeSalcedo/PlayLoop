"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireBrandMember } from "@/lib/brand";

const MAX_BUDGET_FILS = 100_000_000; // AED 1,000,000 — a sanity ceiling, not a business rule.
const MAX_DAYS = 90;

export interface NewCampaign {
  gameId: string;
  rewardId: string;
  /** Whole dirhams as typed by the brand; converted to fils before storing. */
  budgetAed: number;
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
}

const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Creates a campaign in draft. It has no effect on anything until an admin
 * marks it funded — campaignStatus() reports "draft" while fundedAt is null,
 * whatever the dates say, so a brand can't get a live dashboard for something
 * it hasn't paid for.
 *
 * Validation runs before the insert (nothing written yet), so plain throws are
 * right here.
 */
export async function createCampaign(input: NewCampaign): Promise<{ id: string }> {
  const { brand } = await requireBrandMember();
  const db = getDb();

  const budgetAed = Number(input?.budgetAed);
  if (!Number.isFinite(budgetAed) || budgetAed <= 0) throw new Error("Give the campaign a budget.");
  const budgetFils = Math.round(budgetAed * 100);
  if (budgetFils > MAX_BUDGET_FILS) throw new Error("That budget is larger than this console handles.");

  if (!isIsoDay(input?.startsOn) || !isIsoDay(input?.endsOn)) throw new Error("Pick a start and end date.");
  if (input.endsOn < input.startsOn) throw new Error("The end date can't be before the start date.");
  const days = Math.round((Date.parse(input.endsOn) - Date.parse(input.startsOn)) / 86_400_000) + 1;
  if (days > MAX_DAYS) throw new Error(`Campaigns run for up to ${MAX_DAYS} days.`);

  // The game must be live, and the reward must belong to *this* brand — a brand
  // must not be able to fund, and then report on, a competitor's reward pool.
  const [game] = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(and(eq(schema.games.id, String(input.gameId)), eq(schema.games.status, "published")));
  if (!game) throw new Error("Pick a game that's live in the feed.");

  const [reward] = await db
    .select({ id: schema.rewards.id })
    .from(schema.rewards)
    .where(and(eq(schema.rewards.id, String(input.rewardId)), eq(schema.rewards.brandId, brand.id)));
  if (!reward) throw new Error("Pick one of your own rewards.");

  const [created] = await db
    .insert(schema.campaigns)
    .values({
      brandId: brand.id,
      gameId: game.id,
      rewardId: reward.id,
      budgetFils,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    })
    .returning({ id: schema.campaigns.id });

  if (!created) throw new Error("Couldn't create that campaign — try again.");

  revalidatePath("/brand");
  revalidatePath("/admin");
  return { id: created.id };
}

/** Cancels a campaign. Scoped to the caller's brand by the UPDATE itself. */
export async function cancelCampaign(campaignId: string): Promise<{ ok: true }> {
  const { brand } = await requireBrandMember();
  const db = getDb();

  const [cancelled] = await db
    .update(schema.campaigns)
    .set({ cancelledAt: sql`now()` })
    .where(
      and(
        eq(schema.campaigns.id, campaignId),
        eq(schema.campaigns.brandId, brand.id),
        isNull(schema.campaigns.cancelledAt),
      ),
    )
    .returning({ id: schema.campaigns.id });

  if (!cancelled) throw new Error("That campaign isn't yours, or it's already cancelled.");

  revalidatePath("/brand");
  return { ok: true };
}

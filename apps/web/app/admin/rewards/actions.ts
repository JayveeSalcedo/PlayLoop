"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { validateRewardDraft, type RewardDraft } from "@/lib/rewardDraft";

const SLUG_SUFFIX_LENGTH = 5;
const TOPUP_MAX = 100_000;

/** Name -> slug, always with a random suffix so the unique constraint can't collide. */
function toSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "reward";
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SLUG_SUFFIX_LENGTH);
  return `${base}-${suffix}`;
}

function clean(draft: RewardDraft): RewardDraft {
  return {
    name: String(draft?.name ?? "").trim(),
    description: String(draft?.description ?? "").trim(),
    brandId: String(draft?.brandId ?? ""),
    category: String(draft?.category ?? ""),
    costPoints: Number(draft?.costPoints),
    theme: String(draft?.theme ?? ""),
    icon: String(draft?.icon ?? ""),
    poolTotal: draft?.poolTotal == null || draft.poolTotal === ("" as unknown) ? null : Number(draft.poolTotal),
    poolRemaining: draft?.poolRemaining == null ? null : Number(draft.poolRemaining),
  };
}

function revalidate() {
  revalidatePath("/admin/rewards");
  revalidatePath("/rewards");
}

export async function createReward(input: RewardDraft): Promise<{ id: string }> {
  await requireAdmin();
  // A new reward's pool starts full, so remaining always equals total here.
  const draft = { ...clean(input), poolRemaining: null };
  const withPool = { ...draft, poolRemaining: draft.poolTotal };

  const issues = validateRewardDraft(withPool);
  if (issues.length > 0) throw new Error(issues[0]!.message);

  const db = getDb();
  const [created] = await db
    .insert(schema.rewards)
    .values({
      slug: toSlug(draft.name),
      brandId: draft.brandId,
      name: draft.name,
      description: draft.description,
      category: draft.category as "Food and drink" | "Fun" | "Shopping",
      costPoints: draft.costPoints,
      theme: draft.theme,
      icon: draft.icon,
      poolTotal: draft.poolTotal,
      poolRemaining: draft.poolTotal,
    })
    .returning({ id: schema.rewards.id });

  if (!created) throw new Error("Couldn't create that reward — try again.");
  revalidate();
  return { id: created.id };
}

/**
 * Edits a reward's presentation and price. Deliberately does NOT touch
 * poolTotal/poolRemaining — those move only through topUpPool and the
 * redemption decrement, so an edit form can't silently reset a pool that
 * players have been claiming from.
 */
export async function updateReward(rewardId: string, input: RewardDraft): Promise<{ ok: true }> {
  await requireAdmin();
  const db = getDb();

  const existing = await db
    .select({ poolTotal: schema.rewards.poolTotal, poolRemaining: schema.rewards.poolRemaining })
    .from(schema.rewards)
    .where(eq(schema.rewards.id, rewardId))
    .then((r) => r[0]);
  if (!existing) throw new Error("That reward doesn't exist.");

  const draft = { ...clean(input), poolTotal: existing.poolTotal, poolRemaining: existing.poolRemaining };
  const issues = validateRewardDraft(draft);
  if (issues.length > 0) throw new Error(issues[0]!.message);

  await db
    .update(schema.rewards)
    .set({
      brandId: draft.brandId,
      name: draft.name,
      description: draft.description,
      category: draft.category as "Food and drink" | "Fun" | "Shopping",
      costPoints: draft.costPoints,
      theme: draft.theme,
      icon: draft.icon,
    })
    .where(eq(schema.rewards.id, rewardId));

  revalidate();
  return { ok: true };
}

/**
 * Adds units to a capped pool, incrementing total and remaining together in a
 * single SQL-side UPDATE. Never read-then-write: a redemption can land between
 * the read and the write, and that would silently hand back the unit it took.
 */
export async function topUpPool(rewardId: string, units: number): Promise<{ poolRemaining: number | null }> {
  await requireAdmin();
  const n = Number(units);
  if (!Number.isInteger(n) || n <= 0 || n > TOPUP_MAX) throw new Error(`Add between 1 and ${TOPUP_MAX} units.`);

  const db = getDb();
  const [row] = await db
    .update(schema.rewards)
    .set({
      poolTotal: sql`${schema.rewards.poolTotal} + ${n}`,
      poolRemaining: sql`${schema.rewards.poolRemaining} + ${n}`,
    })
    .where(and(eq(schema.rewards.id, rewardId), gte(schema.rewards.poolTotal, 0)))
    .returning({ poolRemaining: schema.rewards.poolRemaining });

  // The WHERE only matches a capped pool; an uncapped reward has null there.
  if (!row) throw new Error("That reward has no pool to top up — it's uncapped.");

  revalidate();
  return row;
}

/**
 * Removing a reward from the player catalogue. Issued vouchers are untouched
 * and stay redeemable at a counter: a player paid points for those, and taking
 * them back because the catalogue changed would be taking something they own.
 */
export async function setRewardActive(rewardId: string, active: boolean): Promise<{ ok: true }> {
  await requireAdmin();
  const db = getDb();

  const [row] = await db
    .update(schema.rewards)
    .set({ active })
    .where(eq(schema.rewards.id, rewardId))
    .returning({ id: schema.rewards.id });

  if (!row) throw new Error("That reward doesn't exist.");
  revalidate();
  return { ok: true };
}

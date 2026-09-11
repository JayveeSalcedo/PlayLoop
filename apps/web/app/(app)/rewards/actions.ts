"use server";

import { VOUCHER_EXPIRY_DAYS } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { voucherQrSvg } from "@/lib/qr";
import { generateVoucherCode } from "@/lib/voucherCode";

export interface RedeemResult {
  code: string;
  qrSvg: string;
  rewardName: string;
  brandName: string;
  theme: string;
  icon: string;
  costPoints: number;
  pointsBalance: number;
  expiresAt: string; // ISO
}

/**
 * Redeems a reward: debits points, writes the ledger entry, and issues a
 * voucher — all in one transaction.
 *
 * Contrast with submitPlay: reward cost is always a server-read DB value,
 * never client-supplied, so there's no "client reports the outcome" trust
 * gap here. The only hazard is concurrency — two redemptions racing a
 * pool's last unit, or racing a play credit landing on the same balance —
 * handled below with conditional UPDATEs whose WHERE guard is evaluated by
 * Postgres against the row at write time, not against an earlier read.
 *
 * Unlike submitPlay, a failed step here should roll back everything (no
 * "keep the rejection for audit" requirement), so this throws directly
 * inside the transaction and lets Postgres roll back — if the balance
 * check fails after a pool unit was already decremented, that decrement
 * must undo too, not persist for a redemption that didn't happen.
 */
export async function redeemReward(rewardId: string): Promise<RedeemResult> {
  const session = await requireSession();
  const db = getDb();

  const written = await db.transaction(async (tx) => {
    const reward = await tx
      .select()
      .from(schema.rewards)
      .where(eq(schema.rewards.id, rewardId))
      .then((r) => r[0]);
    if (!reward || !reward.active) throw new Error("This reward isn't available.");

    if (reward.poolTotal != null) {
      const [updatedPool] = await tx
        .update(schema.rewards)
        .set({ poolRemaining: sql`${schema.rewards.poolRemaining} - 1` })
        .where(and(eq(schema.rewards.id, reward.id), gt(schema.rewards.poolRemaining, 0)))
        .returning();
      if (!updatedPool) throw new Error("This reward just sold out.");
    }

    const [updatedProfile] = await tx
      .update(schema.profiles)
      .set({ pointsBalance: sql`${schema.profiles.pointsBalance} - ${reward.costPoints}` })
      .where(and(eq(schema.profiles.id, session.sub), gte(schema.profiles.pointsBalance, reward.costPoints)))
      .returning({ pointsBalance: schema.profiles.pointsBalance });
    if (!updatedProfile) throw new Error("Not enough points.");

    const code = generateVoucherCode(reward.brandName);
    const expiresAt = new Date(Date.now() + VOUCHER_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const [voucher] = await tx
      .insert(schema.vouchers)
      .values({ profileId: session.sub, rewardId: reward.id, code, costPoints: reward.costPoints, expiresAt })
      .returning();

    await tx.insert(schema.ledgerEntries).values({
      profileId: session.sub,
      delta: -reward.costPoints,
      reason: `Redeemed: ${reward.name}`,
      refType: "voucher",
      refId: voucher!.id,
    });

    return { reward, code, expiresAt, pointsBalance: updatedProfile.pointsBalance };
  });

  const qrSvg = await voucherQrSvg(written.code);
  return {
    code: written.code,
    qrSvg,
    rewardName: written.reward.name,
    brandName: written.reward.brandName,
    theme: written.reward.theme,
    icon: written.reward.icon,
    costPoints: written.reward.costPoints,
    pointsBalance: written.pointsBalance,
    expiresAt: written.expiresAt.toISOString(),
  };
}

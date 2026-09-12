"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { normalizeVoucherCode } from "@/lib/voucherCode";
import { UNDO_WINDOW_MINUTES } from "./constants";

export type LookupResult =
  | { status: "unknown" }
  | { status: "expired"; rewardName: string; brandName: string; expiresAt: string }
  | { status: "already_used"; rewardName: string; brandName: string; redeemedAt: string; storeName: string | null }
  | { status: "wrong_brand"; rewardName: string; brandName: string }
  | {
      status: "active";
      voucherId: string;
      code: string;
      rewardName: string;
      brandName: string;
      playerName: string | null;
      expiresAt: string;
    };

/**
 * Looks up a typed code and says specifically what it is, so the counter can
 * explain the refusal rather than just saying "invalid".
 *
 * Read-only and advisory: redeemVoucher re-checks everything, because the time
 * between looking and confirming is time for the voucher to expire or for
 * another till to take it.
 */
export async function lookupVoucher(rawCode: string): Promise<LookupResult> {
  const { store } = await requireStaff();
  const code = normalizeVoucherCode(String(rawCode ?? ""));
  if (!code) return { status: "unknown" };

  const db = getDb();
  const row = await db
    .select({
      id: schema.vouchers.id,
      code: schema.vouchers.code,
      redeemedAt: schema.vouchers.redeemedAt,
      expiresAt: schema.vouchers.expiresAt,
      rewardName: schema.rewards.name,
      brandId: schema.rewards.brandId,
      brandName: schema.brands.name,
      playerName: schema.profiles.name,
    })
    .from(schema.vouchers)
    .innerJoin(schema.rewards, eq(schema.vouchers.rewardId, schema.rewards.id))
    .innerJoin(schema.brands, eq(schema.rewards.brandId, schema.brands.id))
    .innerJoin(schema.profiles, eq(schema.vouchers.profileId, schema.profiles.id))
    .where(eq(schema.vouchers.code, code))
    .then((r) => r[0]);

  if (!row) return { status: "unknown" };

  const common = { rewardName: row.rewardName, brandName: row.brandName };

  // A Beanhouse voucher must not be burnable at a Glow Arcade counter. Checked
  // before "expired"/"used" so the message names the real problem.
  if (row.brandId !== store.brandId) {
    return { status: "wrong_brand", ...common };
  }

  if (row.redeemedAt) {
    const takenAt = await db
      .select({ storeName: schema.stores.name })
      .from(schema.voucherRedemptions)
      .innerJoin(schema.stores, eq(schema.voucherRedemptions.storeId, schema.stores.id))
      .where(and(eq(schema.voucherRedemptions.voucherId, row.id), isNull(schema.voucherRedemptions.reversedAt)))
      .then((r) => r[0]);
    return {
      status: "already_used",
      ...common,
      redeemedAt: row.redeemedAt.toISOString(),
      storeName: takenAt?.storeName ?? null,
    };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { status: "expired", ...common, expiresAt: row.expiresAt.toISOString() };
  }

  return {
    status: "active",
    voucherId: row.id,
    code: row.code,
    ...common,
    playerName: row.playerName,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * Accepts a voucher at this store.
 *
 * The claim is a conditional UPDATE evaluated by Postgres at write time, not a
 * decision made from the lookup above: two tills scanning the same code at once
 * both read "active", but only one UPDATE matches `redeemed_at IS NULL`, so
 * only one of them takes it. Expiry is checked in the same WHERE against the
 * database's clock rather than the app server's.
 */
export async function redeemVoucher(rawCode: string): Promise<{ rewardName: string; code: string }> {
  const { profile, store } = await requireStaff();
  const code = normalizeVoucherCode(String(rawCode ?? ""));
  if (!code) throw new Error("Enter a voucher code.");

  const db = getDb();

  // Pre-transaction: nothing written yet, so plain throws are right here.
  const voucher = await db
    .select({
      id: schema.vouchers.id,
      rewardName: schema.rewards.name,
      brandId: schema.rewards.brandId,
      brandName: schema.brands.name,
    })
    .from(schema.vouchers)
    .innerJoin(schema.rewards, eq(schema.vouchers.rewardId, schema.rewards.id))
    .innerJoin(schema.brands, eq(schema.rewards.brandId, schema.brands.id))
    .where(eq(schema.vouchers.code, code))
    .then((r) => r[0]);

  if (!voucher) throw new Error("No voucher with that code.");
  if (voucher.brandId !== store.brandId) {
    throw new Error(`That's a ${voucher.brandName} voucher — it can't be used at ${store.brandName}.`);
  }

  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.vouchers)
      .set({ redeemedAt: sql`now()` })
      .where(
        and(
          eq(schema.vouchers.id, voucher.id),
          isNull(schema.vouchers.redeemedAt),
          sql`${schema.vouchers.expiresAt} > now()`,
        ),
      )
      .returning({ id: schema.vouchers.id, code: schema.vouchers.code });

    if (!claimed) {
      return { ok: false as const, error: "That voucher has already been used, or it's expired." };
    }

    await tx.insert(schema.voucherRedemptions).values({
      voucherId: claimed.id,
      storeId: store.id,
      staffProfileId: profile.id,
    });

    return { ok: true as const, rewardName: voucher.rewardName, code: claimed.code };
  });

  if (!outcome.ok) throw new Error(outcome.error);

  revalidatePath("/staff");
  return { rewardName: outcome.rewardName, code: outcome.code };
}

/**
 * Reverses a redemption taken at this store within the last
 * UNDO_WINDOW_MINUTES, for the genuine mis-scan at a till.
 *
 * The window is computed entirely DB-side (`now() - redeemed_at`), never as
 * Date.now() against a timestamp read from the database — app-server/database
 * clock skew is real and already cost this project a debugging session in
 * phase 3 (see docs/handoff.md).
 *
 * The redemption row is kept and stamped reversed_at rather than deleted, so
 * the reversal itself stays auditable.
 */
export async function undoRedemption(redemptionId: string): Promise<{ ok: true }> {
  const { profile, store } = await requireStaff();
  const db = getDb();

  const outcome = await db.transaction(async (tx) => {
    const [reversed] = await tx
      .update(schema.voucherRedemptions)
      .set({ reversedAt: sql`now()`, reversedByProfileId: profile.id })
      .where(
        and(
          eq(schema.voucherRedemptions.id, redemptionId),
          eq(schema.voucherRedemptions.storeId, store.id),
          isNull(schema.voucherRedemptions.reversedAt),
          sql`now() - ${schema.voucherRedemptions.redeemedAt} < interval '${sql.raw(String(UNDO_WINDOW_MINUTES))} minutes'`,
        ),
      )
      .returning({ voucherId: schema.voucherRedemptions.voucherId });

    if (!reversed) {
      return { ok: false as const, error: `That's past the ${UNDO_WINDOW_MINUTES}-minute window to undo.` };
    }

    // Hand the voucher back to the player.
    await tx
      .update(schema.vouchers)
      .set({ redeemedAt: null })
      .where(eq(schema.vouchers.id, reversed.voucherId));

    return { ok: true as const };
  });

  if (!outcome.ok) throw new Error(outcome.error);

  revalidatePath("/staff");
  return { ok: true };
}

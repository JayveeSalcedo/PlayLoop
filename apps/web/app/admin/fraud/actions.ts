"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

const REASON_MAX = 300;

/**
 * Suspends an account: it can no longer start a play or redeem a reward, but
 * can still read its own wallet and the vouchers it already paid for.
 * Enforced by requireActiveProfile() in apps/web/lib/profile.ts.
 *
 * Points already credited are deliberately left alone. Reversing them means
 * writing compensating entries into an append-only ledger and deciding what
 * happens to a balance that would go negative — a bigger decision than this
 * screen should make.
 */
export async function suspendProfile(profileId: string, reason: string): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) throw new Error("Say why — it's the only record of this decision.");
  if (profileId === admin.id) throw new Error("You can't suspend your own account.");

  const db = getDb();
  const [row] = await db
    .update(schema.profiles)
    .set({ suspendedAt: sql`now()`, suspendedReason: trimmed.slice(0, REASON_MAX) })
    .where(and(eq(schema.profiles.id, profileId), isNull(schema.profiles.suspendedAt)))
    .returning({ id: schema.profiles.id });

  if (!row) throw new Error("That account is already suspended.");

  revalidatePath("/admin/fraud");
  revalidatePath(`/admin/fraud/${profileId}`);
  return { ok: true };
}

export async function unsuspendProfile(profileId: string): Promise<{ ok: true }> {
  await requireAdmin();
  const db = getDb();

  const [row] = await db
    .update(schema.profiles)
    .set({ suspendedAt: null, suspendedReason: null })
    .where(and(eq(schema.profiles.id, profileId), isNotNull(schema.profiles.suspendedAt)))
    .returning({ id: schema.profiles.id });

  if (!row) throw new Error("That account isn't suspended.");

  revalidatePath("/admin/fraud");
  revalidatePath(`/admin/fraud/${profileId}`);
  return { ok: true };
}

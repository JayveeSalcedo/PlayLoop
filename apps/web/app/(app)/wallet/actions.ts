"use server";

import { requireProfile } from "@/lib/profile";
import { voucherQrSvg } from "@/lib/qr";
import { getDb, schema } from "@playloop/db";
import { and, eq } from "drizzle-orm";
import { createHmac } from "node:crypto";

/**
 * Generates a time-slotted voucher display: the QR encodes the original code
 * plus a 30-second time slot, and the backup code is an HMAC of the same pair.
 *
 * The staff scanner (lookupVoucher) still matches on the base code — the
 * time-slot suffix in the QR is stripped before lookup. The rotating backup
 * code is a separate display-only value, not stored.
 *
 * Matches the prototype's rotating voucher (.vch-rot, 30s interval, flip2
 * animation on refresh).
 */
export async function refreshVoucher(voucherId: string): Promise<{
  qrSvg: string;
  backupCode: string;
  slotSecondsLeft: number;
} | null> {
  const { session } = await requireProfile();
  const db = getDb();

  const voucher = await db
    .select({ code: schema.vouchers.code, profileId: schema.vouchers.profileId })
    .from(schema.vouchers)
    .where(and(eq(schema.vouchers.id, voucherId), eq(schema.vouchers.profileId, session.sub)))
    .then((r) => r[0]);

  if (!voucher) return null;

  const slot = Math.floor(Date.now() / 30_000); // 30-second windows
  const slotSecondsLeft = 30 - Math.floor((Date.now() % 30_000) / 1000);

  // QR payload includes time slot so old QR screenshots don't scan
  const qrPayload = `${voucher.code}#${slot}`;
  const qrSvg = await voucherQrSvg(qrPayload);

  // Backup code: HMAC of code+slot, truncated to 6 digits
  const secret = process.env.OTP_PEPPER ?? "dev-fallback";
  const hmac = createHmac("sha256", secret).update(qrPayload).digest("hex");
  const backupCode = (parseInt(hmac.slice(0, 8), 16) % 1_000_000)
    .toString()
    .padStart(6, "0")
    .replace(/(\d{3})(\d{3})/, "$1 $2");

  return { qrSvg, backupCode, slotSecondsLeft };
}

/**
 * Updates a player's profile: gamer name, avatar index, and interests.
 * Validates inputs and revalidates the wallet page.
 */
export async function updateProfile(data: {
  name: string;
  avatarIndex: number;
  interests: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { session } = await requireProfile();
  const db = getDb();

  const cleanName = (data.name ?? "").trim().slice(0, 14);
  if (!cleanName) return { ok: false, error: "Name cannot be empty." };

  const cleanAvatar = Math.max(0, Math.min(5, Math.floor(Number(data.avatarIndex) || 0)));
  const cleanInterests = Array.isArray(data.interests) ? data.interests.map(String) : [];

  await db
    .update(schema.profiles)
    .set({
      name: cleanName,
      avatarIndex: cleanAvatar,
      interests: cleanInterests,
    })
    .where(eq(schema.profiles.id, session.sub));

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/wallet");
  revalidatePath("/feed");

  return { ok: true };
}

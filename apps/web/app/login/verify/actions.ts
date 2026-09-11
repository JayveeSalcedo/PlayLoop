"use server";

import { WELCOME_GIFT_BONUS } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/session";
import { verifyOtp } from "@/lib/otp";

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") || "").trim();

  const ok = await verifyOtp(email, code);
  if (!ok) {
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent("Incorrect or expired code")}`,
    );
  }

  const db = getDb();
  let profile = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email)).then((r) => r[0]);

  if (!profile) {
    profile = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.profiles).values({ email }).returning();
      // Welcome gift, ported from the prototype's onboarding bonus (playloop-prototype.html:1211).
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
    });
  }

  await createSession({ sub: profile.id, email: profile.email });
  redirect(profile.onboardedAt ? "/feed" : "/onboarding");
}

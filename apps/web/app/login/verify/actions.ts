"use server";

import { WELCOME_GIFT_BONUS } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/session";
import { landingFor } from "@/lib/surfaces";
import { verifyOtp } from "@/lib/otp";

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") || "").trim();
  const challenge = String(formData.get("challenge") || "").trim() || undefined;

  const ok = await verifyOtp(email, code);
  if (!ok) {
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent("Incorrect or expired code")}${
        challenge ? `&challenge=${encodeURIComponent(challenge)}` : ""
      }`,
    );
  }

  const db = getDb();
  let profile = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email)).then((r) => r[0]);

  if (!profile) {
    // If this brand-new signup came from a challenge link, look it up so we
    // can record referredByChallengeId — set once, here, and never touched
    // again. submitPlay later reads it to decide the referral bonus.
    const referredByChallenge = challenge
      ? await db.select({ id: schema.challenges.id }).from(schema.challenges).where(eq(schema.challenges.code, challenge)).then((r) => r[0])
      : undefined;

    profile = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.profiles)
        .values({ email, referredByChallengeId: referredByChallenge?.id })
        .returning();
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

  if (!profile.onboardedAt) {
    redirect(challenge ? `/onboarding?challenge=${encodeURIComponent(challenge)}` : "/onboarding");
  }
  // A challenge link always wins — that's what they clicked to get here.
  if (challenge) redirect(`/c/${encodeURIComponent(challenge)}`);
  redirect(await landingFor(profile));
}

"use server";

import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { mergeGuestIntoProfile } from "@/lib/claimGuest";
import { maybeAwardReferralBonus } from "@/lib/creditPlay";
import { createNewProfile } from "@/lib/newProfile";
import { safeRedirectPath } from "@/lib/redirectPath";
import { createSession, getSession } from "@/lib/session";
import { landingFor } from "@/lib/surfaces";
import { verifyOtp } from "@/lib/otp";

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") || "").trim();
  const challenge = String(formData.get("challenge") || "").trim() || undefined;
  const redirectTo = safeRedirectPath(String(formData.get("redirect") || ""));
  const redirectQuery = redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : "";

  const ok = await verifyOtp(email, code);
  if (!ok) {
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent("Incorrect or expired code")}${
        challenge ? `&challenge=${encodeURIComponent(challenge)}` : ""
      }${redirectQuery}`,
    );
  }

  const db = getDb();

  // The cookie they arrived with, if any — read before createSession()
  // overwrites it below. A guest profile (see startGuestChallengePlay in
  // app/c/[code]/actions.ts) carries exactly this kind of session: valid,
  // but for a profile that's never had a real email attached.
  const arrivingSession = await getSession();
  let guest: typeof schema.profiles.$inferSelect | undefined;
  if (arrivingSession) {
    const row = await db.select().from(schema.profiles).where(eq(schema.profiles.id, arrivingSession.sub)).then((r) => r[0]);
    if (row?.isGuest) guest = row;
  }

  let profile = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email)).then((r) => r[0]);

  if (!profile && guest) {
    // The common case: a friend played as a guest and is now attaching their
    // real email to that same profile, in place — same id, so every point,
    // XP and challenge win it already earned carries straight over. No
    // second welcome gift (it already got one at guest-creation time) and no
    // re-setting referredByChallengeId (already set, from the challenge that
    // created it).
    const [claimed] = await db
      .update(schema.profiles)
      .set({ email, isGuest: false })
      .where(eq(schema.profiles.id, guest.id))
      .returning();
    profile = claimed!;
    // Only now, since creditVerifiedPlay skipped it while this was still an
    // unclaimed guest — see maybeAwardReferralBonus's doc comment.
    await db.transaction((tx) => maybeAwardReferralBonus(tx, profile!));
  } else if (!profile) {
    // If this brand-new signup came from a challenge link, look it up so we
    // can record referredByChallengeId — set once, here, and never touched
    // again. maybeAwardReferralBonus later reads it to decide the referral
    // bonus.
    const referredByChallenge = challenge
      ? await db.select({ id: schema.challenges.id }).from(schema.challenges).where(eq(schema.challenges.code, challenge)).then((r) => r[0])
      : undefined;

    profile = await db.transaction((tx) => createNewProfile(tx, { email, referredByChallengeId: referredByChallenge?.id }));
  } else if (guest) {
    // Rare: they played as a guest, then logged in with an email that
    // already belongs to a different, real account. Move what the guest
    // earned onto that account instead of stranding it or dropping it.
    profile = await db.transaction((tx) => mergeGuestIntoProfile(tx, guest!.id, profile!.id));
  }

  await createSession({ sub: profile.id, email: profile.email });

  if (!profile.onboardedAt) {
    const challengeQuery = challenge ? `challenge=${encodeURIComponent(challenge)}` : "";
    const query = [challengeQuery, redirectTo ? `redirect=${encodeURIComponent(redirectTo)}` : ""].filter(Boolean).join("&");
    redirect(query ? `/onboarding?${query}` : "/onboarding");
  }
  // A challenge link always wins — that's what they clicked to get here.
  if (challenge) redirect(`/c/${encodeURIComponent(challenge)}`);
  // Otherwise, back to whatever protected page sent them here (see
  // middleware.ts and requireSession()'s callers), before falling back to
  // the generic default landing surface.
  if (redirectTo) redirect(redirectTo);
  redirect(await landingFor(profile));
}

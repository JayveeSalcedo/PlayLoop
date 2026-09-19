"use server";

import { randomUUID } from "node:crypto";
import { getDb } from "@playloop/db";
import { redirect } from "next/navigation";
import { sendOtpEmail } from "@/lib/mailer";
import { createNewProfile } from "@/lib/newProfile";
import { issueOtp } from "@/lib/otp";
import { createSession, getSession } from "@/lib/session";

export async function requestCode(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const challenge = String(formData.get("challenge") || "").trim();
  const challengeQuery = challenge ? `&challenge=${encodeURIComponent(challenge)}` : "";

  if (!email || !email.includes("@")) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email")}${challengeQuery}`);
  }

  const code = await issueOtp(email);
  await sendOtpEmail(email, code);
  redirect(`/login/verify?email=${encodeURIComponent(email)}${challengeQuery}`);
}

/**
 * Universal Guest Mode entrypoint: creates an ephemeral guest profile with the
 * starting 100 pt welcome gift and session cookie, dropping the visitor straight
 * into /feed without entering an email upfront.
 *
 * All gameplay, points (up to GUEST_DAILY_CAP 2,000 pts), levels and streaks
 * function immediately. The guest can later save to OnePass at any time from the
 * banner, wallet, or result screen without losing their progress.
 */
export async function startGuestSession(formData?: FormData) {
  const existing = await getSession();
  if (existing) {
    redirect("/feed");
  }

  const db = getDb();
  const profile = await db.transaction((tx) =>
    createNewProfile(tx, {
      email: `guest+${randomUUID()}@guest.playloop.internal`,
      isGuest: true,
      name: "Guest Player",
    }),
  );

  await createSession({ sub: profile.id, email: profile.email });

  const redirectTo = formData ? String(formData.get("redirectTo") || "").trim() : "";
  redirect(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/feed");
}

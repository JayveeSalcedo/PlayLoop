"use server";

import { redirect } from "next/navigation";
import { sendOtpEmail } from "@/lib/mailer";
import { issueOtp } from "@/lib/otp";

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

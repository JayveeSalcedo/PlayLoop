"use server";

import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/redirectPath";
import { requireSession } from "@/lib/session";

export async function completeOnboarding(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") || "Nova").trim().slice(0, 14) || "Nova";
  const avatarIndex = Number(formData.get("avatarIndex") || 0);
  const interests = formData.getAll("interests").map(String);
  const challenge = String(formData.get("challenge") || "").trim();
  const redirectTo = safeRedirectPath(String(formData.get("redirect") || ""));

  const db = getDb();
  await db
    .update(schema.profiles)
    .set({ name, avatarIndex, interests, onboardedAt: new Date() })
    .where(eq(schema.profiles.id, session.sub));

  // A challenge link always wins — see the same rule in login/verify/actions.ts.
  if (challenge) redirect(`/c/${encodeURIComponent(challenge)}`);
  redirect(redirectTo ?? "/feed?accountSecured=true");
}

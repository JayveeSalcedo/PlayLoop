/**
 * Who may use AI generation: any signed-in, non-suspended profile. The studio
 * was rolled out admin-only at first; this is open to every creator now.
 *
 * For route handlers, which answer with a status rather than redirecting.
 */
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/profile";
import { getSession } from "@/lib/session";

/** Whether this profile can use the studio. Pages use it to choose between the studio and the template wizard. */
export function canUseStudio(profile: Pick<Profile, "suspendedAt">): boolean {
  return profile.suspendedAt == null;
}

/** For studio pages and actions: the profile, or a 404 for a suspended account. */
export async function requireStudio(): Promise<{ profile: Profile }> {
  const { profile } = await requireProfile();
  if (!canUseStudio(profile)) notFound();
  return { profile };
}

export async function studioProfileId(): Promise<{ ok: true; profileId: string } | { ok: false; status: number; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "Sign in first." };
  const [profile] = await getDb()
    .select({ id: schema.profiles.id, suspendedAt: schema.profiles.suspendedAt })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, session.sub));
  if (!profile) return { ok: false, status: 404, error: "Not found." };
  if (profile.suspendedAt) return { ok: false, status: 403, error: "This account is suspended." };
  return { ok: true, profileId: profile.id };
}

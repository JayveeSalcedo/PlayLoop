/**
 * Who may use AI generation right now: admins only, while it's new. Opening it
 * to every creator is a one-line change here once the studio is ready.
 *
 * For route handlers, which answer with a status rather than redirecting.
 * Checks the profile row's email, not the session's claim — the same rule as
 * requireAdmin(), since the cookie lives for 30 days.
 */
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { getSession } from "@/lib/session";

export async function studioProfileId(): Promise<{ ok: true; profileId: string } | { ok: false; status: number; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "Sign in first." };
  const [profile] = await getDb()
    .select({ id: schema.profiles.id, email: schema.profiles.email, suspendedAt: schema.profiles.suspendedAt })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, session.sub));
  // Same answer as a missing route: not-yet-open features shouldn't advertise themselves.
  if (!profile || !isAdminEmail(profile.email)) return { ok: false, status: 404, error: "Not found." };
  if (profile.suspendedAt) return { ok: false, status: 403, error: "This account is suspended." };
  return { ok: true, profileId: profile.id };
}

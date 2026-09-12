import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession, type SessionPayload } from "./session";

export type Profile = typeof schema.profiles.$inferSelect;

/**
 * Like requireSession(), but also loads the profile row and guarantees it
 * exists. A session's `sub` can outlive its profile — e.g. a cookie left
 * over from a wiped/rebuilt database during development, or (later) an
 * account deletion — and every page that did `select().then(r => r[0]!)`
 * on its own crashed with "Cannot read properties of undefined" the moment
 * that happened, instead of just asking the user to log in again.
 *
 * Deliberately does NOT clear the stale cookie here: this runs during a
 * page render, and Next.js only allows writing cookies from a Server
 * Action or Route Handler (an earlier version of this tried to and hit
 * "Cookies can only be modified in a Server Action or Route Handler").
 * Logging in again overwrites the stale cookie via createSession() in
 * login/verify/actions.ts, a Server Action, so it's harmless to leave in
 * place until then.
 */
export async function requireProfile(): Promise<{ session: SessionPayload; profile: Profile }> {
  const session = await requireSession();
  const db = getDb();
  const profile = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, session.sub))
    .then((r) => r[0]);
  if (!profile) redirect("/login");
  return { session, profile };
}

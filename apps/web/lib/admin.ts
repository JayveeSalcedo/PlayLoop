import { notFound } from "next/navigation";
import { requireProfile, type Profile } from "./profile";
import type { SessionPayload } from "./session";

/**
 * Admin access is an allowlist of email addresses in ADMIN_EMAILS, not a role
 * column on profiles. Admins are staff, not a kind of user, and there's nothing
 * in the app that grants or revokes the privilege — you edit the environment.
 * Phase 5 introduces real role storage when brands and store staff exist and
 * there's something to test it against.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether `email` is on the allowlist.
 *
 * An unset or empty ADMIN_EMAILS means *nobody* is an admin. That's the only
 * way this design can fail open, so it's an explicit early return rather than
 * something left to the behaviour of `[].includes(...)` — a refactor that
 * accidentally inverted the emptiness check would otherwise hand the moderation
 * queue to every logged-in user.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Like requireProfile(), but also requires the profile be an admin.
 *
 * Checks profile.email from the database rather than the session JWT's `email`
 * claim: the cookie is client-held and lives for 30 days, so the row is the
 * authority on who this account currently is.
 *
 * Calls notFound() rather than redirecting — a logged-in non-admin shouldn't
 * be able to tell the difference between "not allowed" and "no such page".
 */
export async function requireAdmin(): Promise<{ session: SessionPayload; profile: Profile }> {
  const { session, profile } = await requireProfile();
  if (!isAdminEmail(profile.email)) notFound();
  return { session, profile };
}

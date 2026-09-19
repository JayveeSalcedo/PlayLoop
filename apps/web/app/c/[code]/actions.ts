"use server";

import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createNewProfile } from "@/lib/newProfile";
import { createSession, getSession } from "@/lib/session";

/**
 * The "Play now" action for a challenge link opened by someone who isn't
 * logged in yet. Rather than sending them to /login first (the old flow —
 * see the removed redirect in page.tsx's git history), this silently opens a
 * real (guest) profile and session for them, then drops them straight into
 * the game. They play through the exact same verified pipeline
 * (startChallengedPlay/submitPlay) as a logged-in player, so points are
 * earned and the challenge resolved for real, immediately — not deferred.
 *
 * The profile stays a guest (see profiles.isGuest) — unable to spend or
 * start anything else, per requireActiveProfile() — until they claim it with
 * a real, OTP-verified email from the result screen's CTA, which upgrades
 * this same profile in place rather than losing what it just earned. See
 * login/verify/actions.ts.
 */
export async function startGuestChallengePlay(formData: FormData) {
  const code = String(formData.get("code") || "").trim();
  if (!code) throw new Error("Missing challenge code.");

  // Someone might already be logged in by the time they submit (e.g. they'd
  // logged in from another tab) — just send them into the normal flow rather
  // than layering a pointless guest profile on top of a real one.
  const existing = await getSession();
  if (existing) redirect(`/c/${encodeURIComponent(code)}`);

  const db = getDb();
  const row = await db
    .select({ challenge: schema.challenges, game: schema.games })
    .from(schema.challenges)
    .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
    .where(eq(schema.challenges.code, code))
    .then((r) => r[0]);
  if (!row) throw new Error("That challenge link doesn't exist.");
  const { challenge, game } = row;
  // Already answered (or a race with another opener) — startChallengedPlay
  // would refuse this too, but checking here avoids minting a wasted guest
  // profile + welcome gift for a link that can't be played anyway.
  if (challenge.status !== "pending") redirect(`/c/${encodeURIComponent(code)}`);

  const profile = await db.transaction((tx) =>
    createNewProfile(tx, {
      // Never shown or emailed to — just a placeholder unique key until this
      // profile is claimed with a real address in login/verify/actions.ts.
      email: `guest+${randomUUID()}@guest.playloop.internal`,
      isGuest: true,
      referredByChallengeId: challenge.id,
    }),
  );

  await createSession({ sub: profile.id, email: profile.email });
  redirect(`/play/${game.slug}?challenge=${encodeURIComponent(code)}`);
}

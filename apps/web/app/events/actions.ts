"use server";

import { randomUUID, randomBytes } from "node:crypto";
import { getDb, schema } from "@playloop/db";
import { eq, and, sql } from "drizzle-orm";
import { requireProfile } from "@/lib/profile";
import { createNewProfile } from "@/lib/newProfile";
import { createSession, getSession } from "@/lib/session";
import { calculateRoundPayout, VENUE_EVENTS } from "@/lib/events";

/**
 * Server Action callable from client to establish a guest session if player wasn't signed in.
 */
export async function ensureEventPlayerSession(): Promise<{
  profileId: string;
  name: string;
  avatarIndex: number;
  onePassId: string;
  pointsBalance: number;
  isGuest: boolean;
}> {
  const db = getDb();
  let session = await getSession();

  let profile = session
    ? await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, session.sub))
        .then((r) => r[0])
    : null;

  if (!profile) {
    profile = await db.transaction((tx) =>
      createNewProfile(tx, {
        email: `guest+${randomUUID()}@guest.playloop.internal`,
        isGuest: true,
        name: "Crowd Player",
      }),
    );
    await createSession({ sub: profile.id, email: profile.email });
  }

  const shortId = profile.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
  const initials = (profile.name || "NV").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "NV";
  const onePassId = `OP-${shortId || "8492"}-${initials}`;

  return {
    profileId: profile.id,
    name: profile.name || "Crowd Player",
    avatarIndex: profile.avatarIndex,
    onePassId,
    pointsBalance: profile.pointsBalance,
    isGuest: profile.isGuest,
  };
}

export async function creditEventRoundPoints(args: {
  eventCode: string;
  roundNumber: number;
  score: number;
  rank: number;
  points?: number;
}): Promise<{ ok: boolean; pointsAwarded: number; newBalance: number; error?: string }> {
  const db = getDb();
  let session = await getSession();

  let profile = session
    ? await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, session.sub))
        .then((r) => r[0])
    : null;

  if (!profile) {
    profile = await db.transaction((tx) =>
      createNewProfile(tx, {
        email: `guest+${randomUUID()}@guest.playloop.internal`,
        isGuest: true,
        name: "Crowd Player",
      }),
    );
    await createSession({ sub: profile.id, email: profile.email });
  }

  const event = VENUE_EVENTS[args.eventCode] ?? VENUE_EVENTS["OASIS-LIVE"]!;
  const round = event.rounds.find((r) => r.number === args.roundNumber) ?? event.rounds[0]!;

  const calculatedPoints = calculateRoundPayout(round, args.score, args.rank);
  const cleanPoints = Math.max(15, Math.min(calculatedPoints, 1000));

  await db.insert(schema.ledgerEntries).values({
    profileId: profile.id,
    delta: cleanPoints,
    reason: `${event.title} — Round ${round.number} (#${args.rank})`,
    refType: "event_round",
    refId: randomUUID(),
  });

  const [updated] = await db
    .update(schema.profiles)
    .set({
      pointsBalance: sql`${schema.profiles.pointsBalance} + ${cleanPoints}`,
    })
    .where(eq(schema.profiles.id, profile.id))
    .returning({ pointsBalance: schema.profiles.pointsBalance });

  return {
    ok: true,
    pointsAwarded: cleanPoints,
    newBalance: updated?.pointsBalance ?? profile.pointsBalance + cleanPoints,
  };
}

export async function createArenaSession(gameId: string) {
  const { profile } = await requireProfile();
  const code = randomBytes(3).toString("hex").toUpperCase();
  const db = getDb();

  const [session] = await db
    .insert(schema.arenaSessions)
    .values({
      code,
      gameId,
      hostProfileId: profile.id,
      state: "lobby",
    })
    .returning({ id: schema.arenaSessions.id });

  return { code, sessionId: session!.id };
}

export async function joinArenaSession(code: string) {
  const { profile } = await requireProfile();
  const db = getDb();

  const [session] = await db
    .select({
      id: schema.arenaSessions.id,
      state: schema.arenaSessions.state,
      gameSlug: schema.games.slug,
    })
    .from(schema.arenaSessions)
    .innerJoin(
      schema.games,
      eq(schema.arenaSessions.gameId, schema.games.id),
    )
    .where(eq(schema.arenaSessions.code, code.toUpperCase()))
    .limit(1);

  if (!session) throw new Error("Session not found");
  if (session.state !== "lobby") throw new Error("Session is not in lobby");

  await db
    .insert(schema.arenaPlayers)
    .values({
      sessionId: session.id,
      profileId: profile.id,
      name: profile.name ?? "Player",
      avatarIndex: profile.avatarIndex,
    })
    .onConflictDoNothing();

  return { sessionId: session.id, gameSlug: session.gameSlug };
}

export async function startArenaGame(sessionId: string) {
  const { profile } = await requireProfile();
  const db = getDb();

  const [session] = await db
    .select({ hostProfileId: schema.arenaSessions.hostProfileId })
    .from(schema.arenaSessions)
    .where(eq(schema.arenaSessions.id, sessionId))
    .limit(1);

  if (!session) throw new Error("Session not found");
  if (session.hostProfileId !== profile.id) throw new Error("Not the host");

  await db
    .update(schema.arenaSessions)
    .set({ state: "countdown", startedAt: sql`now()` })
    .where(eq(schema.arenaSessions.id, sessionId));

  return { ok: true };
}

export async function advanceArenaState(
  sessionId: string,
  newState: "playing" | "results",
) {
  const { profile } = await requireProfile();
  const db = getDb();

  const [session] = await db
    .select({ hostProfileId: schema.arenaSessions.hostProfileId })
    .from(schema.arenaSessions)
    .where(eq(schema.arenaSessions.id, sessionId))
    .limit(1);

  if (!session) throw new Error("Session not found");
  if (session.hostProfileId !== profile.id) throw new Error("Not the host");

  await db
    .update(schema.arenaSessions)
    .set({ state: newState })
    .where(eq(schema.arenaSessions.id, sessionId));

  return { ok: true };
}

export async function submitArenaScore(sessionId: string, score: number) {
  const { profile } = await requireProfile();
  const db = getDb();

  await db
    .update(schema.arenaPlayers)
    .set({ score, finishedAt: sql`now()` })
    .where(
      and(
        eq(schema.arenaPlayers.sessionId, sessionId),
        eq(schema.arenaPlayers.profileId, profile.id),
      ),
    );

  return { ok: true };
}

/**
 * Mirrors a player's in-progress score onto the arena leaderboard while
 * they're still playing, so the host's big screen ticks up live instead of
 * sitting at 0 until each player finishes. Purely cosmetic — deliberately
 * separate from submitArenaScore: it never sets finishedAt, and the final,
 * authoritative score submitted there (via the verified-replay pipeline)
 * always overwrites whatever this wrote. Best-effort by design: the caller
 * (GamePlayer/CodeGamePlayer) fires this on a throttle during play and
 * shouldn't surface a network hiccup to a mid-game player, so a player no
 * longer in this session (already finished, or session reset) is a silent
 * no-op rather than a thrown error.
 */
export async function reportArenaScore(sessionId: string, score: number) {
  const { profile } = await requireProfile();
  const db = getDb();

  await db
    .update(schema.arenaPlayers)
    .set({ score })
    .where(
      and(
        eq(schema.arenaPlayers.sessionId, sessionId),
        eq(schema.arenaPlayers.profileId, profile.id),
        sql`${schema.arenaPlayers.finishedAt} IS NULL`,
      ),
    );

  return { ok: true };
}


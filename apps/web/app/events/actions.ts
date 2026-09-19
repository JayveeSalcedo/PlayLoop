"use server";

import { randomUUID } from "node:crypto";
import { getDb, schema } from "@playloop/db";
import { eq, sql } from "drizzle-orm";
import { createNewProfile } from "@/lib/newProfile";
import { qrSvg } from "@/lib/qr";
import { createSession, getSession } from "@/lib/session";
import { calculateRoundPayout, VENUE_EVENTS, type VenueEventConfig } from "@/lib/events";

export async function getEventConfig(code: string): Promise<{ event: VenueEventConfig; qrSvgString: string }> {
  const event = VENUE_EVENTS[code] ?? VENUE_EVENTS["OASIS-LIVE"]!;
  const hostUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const joinUrl = `${hostUrl}/events/join?code=${event.code}`;
  const qrSvgString = await qrSvg(joinUrl);

  return {
    event,
    qrSvgString,
  };
}

export async function getOrCreateEventPlayer(): Promise<{
  profileId: string;
  name: string;
  avatarIndex: number;
  onePassId: string;
  pointsBalance: number;
  isGuest: boolean;
}> {
  const db = getDb();
  const session = await getSession();

  let profile = session
    ? await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, session.sub))
        .then((r) => r[0])
    : null;

  if (!profile) {
    return {
      profileId: "guest_event_player",
      name: "Crowd Player",
      avatarIndex: 0,
      onePassId: "OP-LIVE-NV",
      pointsBalance: 100,
      isGuest: true,
    };
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
    refId: `${event.code}_R${round.number}_${Date.now()}`,
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

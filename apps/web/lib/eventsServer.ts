import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { VENUE_EVENTS, type VenueEventConfig } from "./events";
import { qrSvg } from "./qr";
import { getSession } from "./session";

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

  const profile = session
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

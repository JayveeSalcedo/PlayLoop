"use server";

import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireBrandMember } from "@/lib/brand";
import type { EventRound } from "@/lib/events";

export interface CreateVenueEventInput {
  code: string;
  title: string;
  arabicTitle?: string;
  venueName: string;
  location: string;
  sponsorTagline?: string;
  accentColor: string;
  prizePoolPoints: number;
  rounds: EventRound[];
}

export async function createVenueEvent(input: CreateVenueEventInput): Promise<{ code: string }> {
  const { profile, brand } = await requireBrandMember();
  const db = getDb();

  const code = (input.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!code || code.length < 3 || code.length > 20) {
    throw new Error("Activation Join Code must be between 3 and 20 alphanumeric characters (e.g. HILLS-LIVE).");
  }

  const title = (input.title || "").trim();
  if (!title || title.length < 3) {
    throw new Error("Please enter an activation event title.");
  }

  const venueName = (input.venueName || "").trim();
  if (!venueName) {
    throw new Error("Please enter a venue or arena name (e.g. Dubai Hills Mall).");
  }

  const location = (input.location || "").trim();
  if (!location) {
    throw new Error("Please specify the LED screen location (e.g. Central Atrium LED Wall).");
  }

  const prizePoolPoints = Number(input.prizePoolPoints) || 5000;
  if (prizePoolPoints < 500 || prizePoolPoints > 1_000_000) {
    throw new Error("Prize pool budget must be between 500 and 1,000,000 points.");
  }

  if (!input.rounds || input.rounds.length === 0) {
    throw new Error("Please configure at least 1 arena round.");
  }

  // Ensure rounds have valid numbers and parameters
  const validatedRounds: EventRound[] = input.rounds.map((r, idx) => {
    const roundNum = idx + 1;
    const gameType = r.gameType === "catch" || r.gameType === "reflex" ? r.gameType : "tap";
    const durationSeconds = Math.max(15, Math.min(120, Number(r.durationSeconds) || 30));
    const targetScore = Math.max(50, Math.min(2000, Number(r.targetScore) || 250));
    const maxPoints = Math.max(50, Math.min(1000, Number(r.maxPoints) || 300));
    return {
      number: roundNum,
      title: (r.title || `Round ${roundNum}`).trim(),
      arabicTitle: (r.arabicTitle || `الجولة ${roundNum}`).trim(),
      gameType,
      durationSeconds,
      targetScore,
      maxPoints,
    };
  });

  // Check if code is already taken
  const existing = await db
    .select({ id: schema.venueEvents.id })
    .from(schema.venueEvents)
    .where(eq(schema.venueEvents.code, code))
    .then((r) => r[0]);

  if (existing) {
    throw new Error(`The code "${code}" is already in use by another arena activation. Pick a unique code.`);
  }

  const sponsorName = brand.name;
  const sponsorTagline = (input.sponsorTagline || "").trim() || `Presented by ${brand.name}`;
  const accentColor = input.accentColor || "#FFDD3C";

  await db.insert(schema.venueEvents).values({
    brandId: brand.id,
    code,
    title,
    arabicTitle: input.arabicTitle?.trim() || null,
    venueName,
    location,
    sponsorName,
    sponsorTagline,
    accentColor,
    prizePoolPoints,
    status: "live",
    rounds: validatedRounds,
    creatorId: profile.id,
  });

  revalidatePath("/brand");
  revalidatePath("/events");
  return { code };
}

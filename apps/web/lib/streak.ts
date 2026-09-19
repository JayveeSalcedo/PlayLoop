import { getDb, schema } from "@playloop/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * How many consecutive calendar days (counting back from today or yesterday)
 * this profile has at least one completed play session.
 *
 * No schema column needed — derived from play_sessions timestamps every time.
 * The query groups completed sessions by date, then walks backward checking
 * for gaps. Naturally capped by total rows, and the index on
 * (profile_id, status, started_at) keeps it fast.
 *
 * Returns { streak, playedToday }.
 */
export async function getStreak(
  profileId: string,
  now: Date = new Date(),
): Promise<{ streak: number; playedToday: boolean }> {
  const db = getDb();

  // Get distinct calendar dates with a completed play, most recent first.
  // Using started_at::date in the server's timezone (UTC for Supabase).
  const rows = await db
    .selectDistinct({
      day: sql<string>`(${schema.playSessions.startedAt} AT TIME ZONE 'UTC')::date`.as("day"),
    })
    .from(schema.playSessions)
    .where(
      and(
        eq(schema.playSessions.profileId, profileId),
        eq(schema.playSessions.status, "completed"),
      ),
    )
    .orderBy(sql`day DESC`)
    .limit(60); // 60 days is more than enough

  if (rows.length === 0) return { streak: 0, playedToday: false };

  // Walk backward from today/yesterday counting consecutive days.
  const todayStr = toDateStr(now);
  const yesterdayStr = toDateStr(new Date(now.getTime() - 86_400_000));
  const daySet = new Set(rows.map((r) => r.day));

  const playedToday = daySet.has(todayStr);

  // If they didn't play today AND didn't play yesterday, streak is 0.
  if (!playedToday && !daySet.has(yesterdayStr)) return { streak: 0, playedToday: false };

  // Start counting from today if played today, otherwise from yesterday.
  let checkDate = playedToday ? now : new Date(now.getTime() - 86_400_000);
  let streak = 0;

  while (daySet.has(toDateStr(checkDate))) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 86_400_000);
  }

  return { streak, playedToday };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

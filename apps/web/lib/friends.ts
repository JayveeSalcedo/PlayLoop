import { getDb, schema } from "@playloop/db";
import { and, eq, or, sql, desc } from "drizzle-orm";
import type { Tx } from "@playloop/db";

/**
 * Ensures a friendship exists between two profiles. Called after a challenge
 * is completed. Uses the profileA < profileB convention to prevent duplicates.
 * Silently skips if they're already friends (ON CONFLICT DO NOTHING).
 */
export async function ensureFriendship(tx: Tx, profileId1: string, profileId2: string) {
  if (profileId1 === profileId2) return;
  const [profileAId, profileBId] =
    profileId1 < profileId2 ? [profileId1, profileId2] : [profileId2, profileId1];

  // ON CONFLICT requires a unique index. Since we don't have one yet (only
  // individual column indexes), use a subquery guard instead.
  const existing = await tx
    .select({ id: schema.friendships.id })
    .from(schema.friendships)
    .where(and(eq(schema.friendships.profileAId, profileAId), eq(schema.friendships.profileBId, profileBId)))
    .then((r) => r[0]);

  if (!existing) {
    await tx.insert(schema.friendships).values({ profileAId, profileBId });
  }
}

export interface FriendRow {
  id: string;
  name: string | null;
  avatarIndex: number;
  level: number;
  pointsBalance: number;
}

/** All friends of a profile, with their name, avatar, level, and points. */
export async function getFriends(profileId: string): Promise<FriendRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      friendId: sql<string>`
        CASE
          WHEN ${schema.friendships.profileAId} = ${profileId} THEN ${schema.friendships.profileBId}
          ELSE ${schema.friendships.profileAId}
        END
      `.as("friend_id"),
    })
    .from(schema.friendships)
    .where(
      or(
        eq(schema.friendships.profileAId, profileId),
        eq(schema.friendships.profileBId, profileId),
      ),
    )
    .orderBy(desc(schema.friendships.createdAt));

  if (rows.length === 0) return [];

  const friendIds = rows.map((r) => r.friendId);
  const profiles = await db
    .select({
      id: schema.profiles.id,
      name: schema.profiles.name,
      avatarIndex: schema.profiles.avatarIndex,
      level: schema.profiles.level,
      pointsBalance: schema.profiles.pointsBalance,
    })
    .from(schema.profiles)
    .where(or(...friendIds.map((id) => eq(schema.profiles.id, id))));

  return profiles;
}

export interface LeaderboardEntry {
  profileId: string;
  weeklyPoints: number;
}

/**
 * Weekly leaderboard: friends + self, ranked by total points earned this
 * week (sum of positive ledger entries since Monday 00:00 UTC).
 */
export async function getWeeklyLeaderboard(profileId: string): Promise<LeaderboardEntry[]> {
  const friends = await getFriends(profileId);
  if (friends.length === 0) return [];

  const db = getDb();
  const allIds = [profileId, ...friends.map((f) => f.id)];

  const rows = await db
    .select({
      profileId: schema.ledgerEntries.profileId,
      weeklyPoints: sql<number>`coalesce(sum(${schema.ledgerEntries.delta}), 0)`.as("weekly_points"),
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        or(...allIds.map((id) => eq(schema.ledgerEntries.profileId, id))),
        sql`${schema.ledgerEntries.delta} > 0`,
        sql`${schema.ledgerEntries.createdAt} >= date_trunc('week', current_date)`,
      ),
    )
    .groupBy(schema.ledgerEntries.profileId)
    .orderBy(sql`weekly_points DESC`);

  return rows;
}

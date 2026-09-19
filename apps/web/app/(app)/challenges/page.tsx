import { getDb, schema } from "@playloop/db";
import { and, desc, eq, or } from "drizzle-orm";
import { currentSeason, getSeasonPassProgress } from "@playloop/economy";
import { requireProfile } from "@/lib/profile";
import { getFriends, getWeeklyLeaderboard } from "@/lib/friends";
import { getLeagueLeaderboard, getLeaguesForProfile, type LeaderboardEntry } from "@/lib/leagues";
import { CompeteTabs } from "./CompeteTabs";

/**
 * No "Incoming" queue here, on purpose: a challenge has no recipient until
 * someone actually completes a play through its link (see the challenges
 * table's doc comment in packages/db/src/schema.ts) — opening the link and
 * playing happen in one flow, so there's no addressed-but-not-yet-played
 * state to show. Just Sent (awaiting a reply) and History (completed).
 */
export default async function ChallengesPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  // Load 1-on-1 challenges, friends, and leagues in parallel
  const [sent, history, friends, weeklyBoard, { joined, open }] = await Promise.all([
    db
      .select({
        code: schema.challenges.code,
        senderScore: schema.challenges.senderScore,
        createdAt: schema.challenges.createdAt,
        gameTitle: schema.games.title,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
      .where(and(eq(schema.challenges.senderId, profile.id), eq(schema.challenges.status, "pending")))
      .orderBy(desc(schema.challenges.createdAt)),
    db
      .select({
        senderId: schema.challenges.senderId,
        recipientId: schema.challenges.recipientId,
        winnerId: schema.challenges.winnerId,
        senderScore: schema.challenges.senderScore,
        gameTitle: schema.games.title,
        completedAt: schema.challenges.completedAt,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
      .where(
        and(
          eq(schema.challenges.status, "completed"),
          or(eq(schema.challenges.senderId, profile.id), eq(schema.challenges.recipientId, profile.id)),
        ),
      )
      .orderBy(desc(schema.challenges.completedAt)),
    getFriends(profile.id),
    getWeeklyLeaderboard(profile.id),
    getLeaguesForProfile(profile.id),
  ]);

  // Fetch names/avatars for opponents seen in history
  const opponentIds = [
    ...new Set(history.map((h) => (h.senderId === profile.id ? h.recipientId : h.senderId)).filter((id): id is string => !!id)),
  ];
  const opponents = opponentIds.length
    ? await db
        .select({ id: schema.profiles.id, name: schema.profiles.name, avatarIndex: schema.profiles.avatarIndex })
        .from(schema.profiles)
        .where(or(...opponentIds.map((id) => eq(schema.profiles.id, id))))
    : [];

  // Fetch leaderboards for each joined league in parallel
  const leaderboardsByLeagueId: Record<string, LeaderboardEntry[]> = {};
  await Promise.all(
    joined.map(async (l) => {
      leaderboardsByLeagueId[l.id] = await getLeagueLeaderboard(l.id, profile.id);
    }),
  );

  const season = currentSeason();
  const passProgress = getSeasonPassProgress(profile.pointsBalance);

  return (
    <CompeteTabs
      profile={profile}
      season={season}
      passProgress={passProgress}
      joinedLeagues={joined}
      openLeagues={open}
      leaderboardsByLeagueId={leaderboardsByLeagueId}
      sent={sent}
      history={history}
      friends={friends}
      weeklyBoard={weeklyBoard}
      opponents={opponents}
    />
  );
}

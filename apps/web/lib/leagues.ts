import { getDb, schema } from "@playloop/db";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

export interface LeagueItem {
  id: string;
  name: string;
  kind: string; // 'school' | 'company' | 'mall' | 'family' | 'community'
  code: string;
  description: string | null;
  icon: string;
  color: string;
  teamName: string | null;
  role: string;
  joined: boolean;
  memberCount: number;
  userRank: number;
  userPoints: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  teamName: string | null;
  avatarIndex: number;
  score: number;
  rank: number;
  isMe: boolean;
}

// Preset rival demo competitors matching playloop_8.html lines 2656-2660
const DEMO_RIVALS: Record<string, [string, number, number][]> = {
  "HORIZON-8B": [
    ["Falcon Heights School", 51_340, 1],
    ["Palm Grove School", 39_880, 2],
    ["Sandstone Academy", 30_120, 3],
    ["Lighthouse School", 27_450, 4],
  ],
  "OASIS-MALL": [
    ["Maryam S.", 3_410, 1],
    ["Arjun P.", 2_950, 2],
    ["Chloe D.", 2_210, 3],
    ["Rashid A.", 1_760, 4],
    ["Joy M.", 980, 5],
  ],
  "FAMILY-NOVA": [
    ["The Reyes Family", 9_870, 1],
    ["Team Hessa", 8_215, 2],
    ["The Kapoor Family", 7_340, 3],
    ["The Haddad Family", 5_120, 4],
    ["Team Salem", 4_480, 5],
  ],
  "ACME-TECH": [
    ["Engineering Squad", 14_200, 1],
    ["Product & Design", 12_850, 2],
    ["Growth & Marketing", 9_600, 3],
    ["People & Culture", 7_400, 4],
  ],
};

/**
 * Returns joined leagues for `profileId`, plus available open leagues.
 */
export async function getLeaguesForProfile(profileId: string): Promise<{
  joined: LeagueItem[];
  open: LeagueItem[];
}> {
  const db = getDb();

  const allLeagues = await db.select().from(schema.leagues).orderBy(schema.leagues.createdAt);
  if (allLeagues.length === 0) return { joined: [], open: [] };

  const memberships = await db
    .select()
    .from(schema.leagueMembers)
    .where(eq(schema.leagueMembers.profileId, profileId));

  const memberByLeagueId = new Map(memberships.map((m) => [m.leagueId, m]));

  // Count total members per league
  const memberCounts = await db
    .select({ leagueId: schema.leagueMembers.leagueId, n: count() })
    .from(schema.leagueMembers)
    .groupBy(schema.leagueMembers.leagueId);

  const countByLeagueId = new Map(memberCounts.map((c) => [c.leagueId, c.n]));

  // Profile's current points
  const profile = await db
    .select({ points: schema.profiles.pointsBalance })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .then((r) => r[0]);

  const currentPoints = profile?.points ?? 0;

  const joined: LeagueItem[] = [];
  const open: LeagueItem[] = [];

  for (const l of allLeagues) {
    const mem = memberByLeagueId.get(l.id);
    const rivals = DEMO_RIVALS[l.code] ?? [];
    const baseMembersCount = (countByLeagueId.get(l.id) ?? 0) + rivals.length;

    if (mem) {
      // Compute user rank among rivals + real members
      const rivalScores = rivals.map((r) => r[1]);
      const allScores = [...rivalScores, currentPoints].sort((a, b) => b - a);
      const userRank = allScores.indexOf(currentPoints) + 1;

      joined.push({
        id: l.id,
        name: l.name,
        kind: l.kind,
        code: l.code,
        description: l.description,
        icon: l.icon,
        color: l.color,
        teamName: mem.teamName,
        role: mem.role,
        joined: true,
        memberCount: Math.max(1, baseMembersCount),
        userRank: Math.max(1, userRank),
        userPoints: currentPoints,
      });
    } else {
      open.push({
        id: l.id,
        name: l.name,
        kind: l.kind,
        code: l.code,
        description: l.description,
        icon: l.icon,
        color: l.color,
        teamName: null,
        role: "guest",
        joined: false,
        memberCount: Math.max(1, baseMembersCount),
        userRank: 0,
        userPoints: 0,
      });
    }
  }

  return { joined, open };
}

/**
 * Returns ranked leaderboard members for a given league.
 */
export async function getLeagueLeaderboard(
  leagueId: string,
  currentProfileId?: string,
): Promise<LeaderboardEntry[]> {
  const db = getDb();

  const league = await db
    .select()
    .from(schema.leagues)
    .where(eq(schema.leagues.id, leagueId))
    .then((r) => r[0]);
  if (!league) return [];

  // Fetch real members
  const memberRows = await db
    .select({
      memberId: schema.leagueMembers.id,
      profileId: schema.leagueMembers.profileId,
      teamName: schema.leagueMembers.teamName,
      name: schema.profiles.name,
      avatarIndex: schema.profiles.avatarIndex,
      points: schema.profiles.pointsBalance,
    })
    .from(schema.leagueMembers)
    .innerJoin(schema.profiles, eq(schema.leagueMembers.profileId, schema.profiles.id))
    .where(eq(schema.leagueMembers.leagueId, leagueId));

  const entries: LeaderboardEntry[] = [];

  for (const m of memberRows) {
    entries.push({
      id: m.profileId,
      name: m.name ?? "Player",
      teamName: m.teamName,
      avatarIndex: m.avatarIndex,
      score: m.points,
      rank: 0,
      isMe: m.profileId === currentProfileId,
    });
  }

  // Include demo competitors if present for prototype fidelity
  const rivals = DEMO_RIVALS[league.code] ?? [];
  for (let i = 0; i < rivals.length; i++) {
    const [rName, rScore, rAvatar] = rivals[i]!;
    entries.push({
      id: `rival-${i}-${league.code}`,
      name: rName,
      teamName: league.kind === "school" ? "Class Competitor" : "Team Competitor",
      avatarIndex: rAvatar,
      score: rScore,
      rank: 0,
      isMe: false,
    });
  }

  // Sort descending by score
  entries.sort((a, b) => b.score - a.score);

  // Assign 1-indexed ranks
  return entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

/**
 * Validates league code and joins the profile to the league.
 */
export async function joinLeagueByCode(
  profileId: string,
  rawCode: string,
  teamName?: string,
): Promise<{ ok: boolean; error?: string; league?: typeof schema.leagues.$inferSelect }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a valid league code." };

  const db = getDb();
  const league = await db
    .select()
    .from(schema.leagues)
    .where(eq(schema.leagues.code, code))
    .then((r) => r[0]);

  if (!league) {
    return {
      ok: false,
      error:
        code.startsWith("SCH") || code.startsWith("HOR")
          ? "Code not recognised. Ask your teacher for your class code."
          : "Code not recognised. Check the code with your organizer.",
    };
  }

  await db
    .insert(schema.leagueMembers)
    .values({
      leagueId: league.id,
      profileId,
      teamName: teamName?.trim() || null,
      role: "member",
    })
    .onConflictDoNothing();

  return { ok: true, league };
}

/**
 * Creates a brand-new custom league and joins the creator as admin.
 */
export async function createCustomLeague(
  profileId: string,
  args: {
    name: string;
    kind: string;
    code?: string;
    description?: string;
    icon?: string;
    color?: string;
    teamName?: string;
  },
): Promise<{ ok: boolean; error?: string; league?: typeof schema.leagues.$inferSelect }> {
  const name = args.name.trim();
  if (!name) return { ok: false, error: "League name cannot be empty." };

  const kind = args.kind.trim().toLowerCase() || "community";

  // Auto-generate code if none provided: e.g. NOVA-7A2F
  const defaultCodePrefix = kind.slice(0, 4).toUpperCase();
  const randomSuffix = randomBytes(2).toString("hex").toUpperCase();
  const code = args.code ? args.code.trim().toUpperCase() : `${defaultCodePrefix}-${randomSuffix}`;

  const iconByKind: Record<string, string> = {
    school: "cap",
    company: "briefcase",
    mall: "bag",
    family: "heart",
    community: "trophy",
  };

  const colorByKind: Record<string, string> = {
    school: "#3FC8FF",
    company: "#22D39B",
    mall: "#FFDD3C",
    family: "#FF5FA2",
    community: "#FF7A1A",
  };

  const icon = args.icon || iconByKind[kind] || "trophy";
  const color = args.color || colorByKind[kind] || "#3FC8FF";

  const db = getDb();

  try {
    const [league] = await db
      .insert(schema.leagues)
      .values({
        name,
        kind,
        code,
        description: args.description?.trim() || null,
        icon,
        color,
        creatorId: profileId,
      })
      .returning();

    await db.insert(schema.leagueMembers).values({
      leagueId: league!.id,
      profileId,
      teamName: args.teamName?.trim() || "My Team",
      role: "admin",
    });

    return { ok: true, league: league! };
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return { ok: false, error: "That league code is already in use. Try a different code." };
    }
    return { ok: false, error: "Could not create league. Please try again." };
  }
}

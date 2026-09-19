/**
 * National Seasons and Season Pass progression, ported from the prototype
 * (playloop_8.html, lines 2636-2655).
 *
 * Seasons rotate across the year, giving all players and leagues unified
 * milestones, seasonal cups, and tier unlocks.
 */

export interface Season {
  id: string;
  name: string;
  nameAr: string;
  tag: string;
  description: string;
  icon: string;
  color: string;
  sponsor: string;
  startDate: string;
  endDate: string;
  games: string[];
}

export const SEASONS: Season[] = [
  {
    id: "school",
    name: "Schools Cup",
    nameAr: "كأس المدارس",
    tag: "School League Kickoff",
    description:
      "Teachers turn lessons into quiz games. Classes compete for the season cup, and every student's points count for their class.",
    icon: "cap",
    color: "#3FC8FF",
    sponsor: "Education & Family Title Partner",
    startDate: "2026-09-01",
    endDate: "2026-11-15",
    games: ["Desert Genius", "Bean Catcher", "Tap Frenzy"],
  },
  {
    id: "national",
    name: "National League Cup",
    nameAr: "كأس الدوري الوطني",
    tag: "All Leagues on One Leaderboard",
    description:
      "55-second games, heritage quizzes and mall trails. Every school, company, mall, and family league competes on a single national board.",
    icon: "trophy",
    color: "#FFDD3C",
    sponsor: "National Brand Partner & Mall Operators",
    startDate: "2026-11-16",
    endDate: "2026-12-31",
    games: ["Desert Genius", "Neon Pairs", "Bean Catcher"],
  },
  {
    id: "family",
    name: "Family League Championship",
    nameAr: "بطولة دوري العائلات",
    tag: "Year of Family: Growing in Unity",
    description:
      "Parents and kids play as one team. Points count when family members play together to unlock shared vouchers.",
    icon: "heart",
    color: "#FF5FA2",
    sponsor: "Telecom & Grocery Family Partners",
    startDate: "2027-01-01",
    endDate: "2027-02-28",
    games: ["Neon Pairs", "Tap Frenzy", "Bean Catcher"],
  },
  {
    id: "giving",
    name: "Community Giving League",
    nameAr: "دوري العطاء المجتمعي",
    tag: "Calm Evening Play & Giving",
    description:
      "Teams convert points into matched charity donations after iftar, sponsored by title giving partners.",
    icon: "spark",
    color: "#22D39B",
    sponsor: "Giving & Philanthropy Partners",
    startDate: "2027-03-01",
    endDate: "2027-04-15",
    games: ["Desert Genius", "Neon Pairs"],
  },
  {
    id: "summer",
    name: "Summer Mall League",
    nameAr: "دوري المول الصيفي",
    tag: "Mall & Holiday Camp Leagues",
    description:
      "Indoor leagues when it's hottest outside. Mall trails, arcade sprints, camp tournaments, and weekly finals.",
    icon: "sun",
    color: "#FF7A1A",
    sponsor: "Mall Operators & Entertainment Brands",
    startDate: "2027-06-01",
    endDate: "2027-08-31",
    games: ["Tap Frenzy", "Bean Catcher", "Neon Pairs"],
  },
];

/**
 * Returns the currently active season based on today's date, or falls back to
 * the primary seasonal cup (Schools Cup).
 */
export function currentSeason(now = new Date()): Season {
  const today = now.toISOString().slice(0, 10);
  const active = SEASONS.find((s) => s.startDate <= today && today <= s.endDate);
  return active ?? SEASONS[0]!;
}

/**
 * Computes days remaining in a season. Returns 0 if already concluded.
 */
export function seasonDaysRemaining(season: Season, now = new Date()): number {
  const end = new Date(season.endDate + "T23:59:59Z").getTime();
  const diff = end - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export interface SeasonPassTier {
  tier: number;
  name: string;
  pointsNeeded: number;
  reward: string;
  icon: string;
}

export const SEASON_PASS_TIERS: SeasonPassTier[] = [
  {
    tier: 1,
    name: "Bronze Competitor",
    pointsNeeded: 500,
    reward: "Season 1 Competitor Badge",
    icon: "star",
  },
  {
    tier: 2,
    name: "Silver Contender",
    pointsNeeded: 1_200,
    reward: "1.5x Streak Shield Pass",
    icon: "spark",
  },
  {
    tier: 3,
    name: "Gold Challenger",
    pointsNeeded: 2_500,
    reward: "Double Points Challenge Voucher",
    icon: "gift",
  },
  {
    tier: 4,
    name: "Champion",
    pointsNeeded: 4_000,
    reward: "Exclusive League Avatar Frame",
    icon: "trophy",
  },
  {
    tier: 5,
    name: "National Legend",
    pointsNeeded: 6_000,
    reward: "Title: UAE National Competitor",
    icon: "crown",
  },
];

export interface PassProgress {
  currentTier: number;
  tierName: string;
  nextTier: SeasonPassTier | null;
  points: number;
  pointsToNext: number;
  percent: number;
  unlockedPerks: string[];
}

/**
 * Computes Season Pass progress from a player's cumulative seasonal points.
 */
export function getSeasonPassProgress(points: number): PassProgress {
  let currentTier = 0;
  let tierName = "Unranked";
  const unlockedPerks: string[] = [];

  for (const t of SEASON_PASS_TIERS) {
    if (points >= t.pointsNeeded) {
      currentTier = t.tier;
      tierName = t.name;
      unlockedPerks.push(t.reward);
    }
  }

  const nextTier = SEASON_PASS_TIERS.find((t) => t.tier === currentTier + 1) ?? null;
  const currentFloor = currentTier > 0 ? SEASON_PASS_TIERS[currentTier - 1]!.pointsNeeded : 0;
  const targetCeiling = nextTier ? nextTier.pointsNeeded : SEASON_PASS_TIERS[SEASON_PASS_TIERS.length - 1]!.pointsNeeded;

  const pointsInCurrentWindow = Math.max(0, points - currentFloor);
  const totalWindow = targetCeiling - currentFloor;
  const percent = nextTier ? Math.min(100, Math.round((pointsInCurrentWindow / totalWindow) * 100)) : 100;
  const pointsToNext = nextTier ? Math.max(0, nextTier.pointsNeeded - points) : 0;

  return {
    currentTier,
    tierName,
    nextTier,
    points,
    pointsToNext,
    percent,
    unlockedPerks,
  };
}

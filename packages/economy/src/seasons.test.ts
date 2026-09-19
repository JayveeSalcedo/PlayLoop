import { describe, expect, it } from "vitest";
import {
  currentSeason,
  getSeasonPassProgress,
  seasonDaysRemaining,
  SEASON_PASS_TIERS,
  SEASONS,
} from "./seasons";

describe("National Seasons & Season Pass Engine", () => {
  it("contains all 5 national seasons matching prototype", () => {
    expect(SEASONS.length).toBe(5);
    const ids = SEASONS.map((s) => s.id);
    expect(ids).toEqual(["school", "national", "family", "giving", "summer"]);
  });

  it("identifies active season by date with fallback", () => {
    const testDate = new Date("2026-10-01T12:00:00Z");
    const season = currentSeason(testDate);
    expect(season.id).toBe("school");
    expect(season.name).toBe("Schools Cup");
  });

  it("calculates days remaining accurately", () => {
    const season = SEASONS.find((s) => s.id === "school")!;
    const now = new Date("2026-11-10T00:00:00Z");
    const days = seasonDaysRemaining(season, now);
    expect(days).toBeGreaterThan(0);
  });

  it("calculates season pass progression through 5 tiers", () => {
    expect(SEASON_PASS_TIERS.length).toBe(5);

    // Unranked
    const p0 = getSeasonPassProgress(100);
    expect(p0.currentTier).toBe(0);
    expect(p0.tierName).toBe("Unranked");
    expect(p0.nextTier?.tier).toBe(1);
    expect(p0.pointsToNext).toBe(400);

    // Bronze (500 pts)
    const p1 = getSeasonPassProgress(500);
    expect(p1.currentTier).toBe(1);
    expect(p1.tierName).toBe("Bronze Competitor");
    expect(p1.nextTier?.tier).toBe(2);

    // Legend (6,000 pts)
    const p5 = getSeasonPassProgress(6_500);
    expect(p5.currentTier).toBe(5);
    expect(p5.tierName).toBe("National Legend");
    expect(p5.nextTier).toBeNull();
    expect(p5.percent).toBe(100);
  });
});

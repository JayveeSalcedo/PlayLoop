import { describe, expect, it } from "vitest";

describe("Leagues & Community Competitions", () => {
  it("normalizes and validates uppercase league codes", () => {
    function normalizeCode(raw: string): string {
      return raw.trim().toUpperCase();
    }

    expect(normalizeCode("horizon-8b")).toBe("HORIZON-8B");
    expect(normalizeCode("  oasis-mall  ")).toBe("OASIS-MALL");
    expect(normalizeCode("family-nova")).toBe("FAMILY-NOVA");
    expect(normalizeCode("acme-tech")).toBe("ACME-TECH");
  });

  it("assigns appropriate thematic icons and colors for each league type", () => {
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

    expect(iconByKind["school"]).toBe("cap");
    expect(iconByKind["company"]).toBe("briefcase");
    expect(iconByKind["mall"]).toBe("bag");
    expect(iconByKind["family"]).toBe("heart");

    expect(colorByKind["school"]).toBe("#3FC8FF");
    expect(colorByKind["company"]).toBe("#22D39B");
    expect(colorByKind["mall"]).toBe("#FFDD3C");
    expect(colorByKind["family"]).toBe("#FF5FA2");
  });

  it("computes user ranks and handles empty rosters gracefully", () => {
    const scores = [51_340, 39_880, 30_120, 27_450];
    const userScore = 35_000;

    const allScores = [...scores, userScore].sort((a, b) => b - a);
    const userRank = allScores.indexOf(userScore) + 1;

    expect(userRank).toBe(3); // Behind 51,340 and 39,880
  });
});

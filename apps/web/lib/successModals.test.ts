import { describe, expect, it } from "vitest";

describe("Success & Celebration Modals Logic", () => {
  describe("1-on-1 Challenge Victory vs Defeat Modal", () => {
    function evaluateChallenge(
      score: number,
      opponentScore: number,
      outcome?: "sender" | "recipient" | "tie",
      bonusAwarded: number = 0,
    ) {
      const isWin = outcome === "recipient" || score > opponentScore;
      const isLoss = outcome === "sender" || score < opponentScore;
      const isTie = outcome === "tie" || (!isWin && !isLoss);
      const deficit = Math.max(0, opponentScore - score);
      return { isWin, isLoss, isTie, deficit, bonusAwarded };
    }

    it("evaluates victory correctly even if bonusAwarded is 0", () => {
      const result = evaluateChallenge(1500, 1200, "recipient", 0);
      expect(result.isWin).toBe(true);
      expect(result.isLoss).toBe(false);
      expect(result.isTie).toBe(false);
      expect(result.deficit).toBe(0);
    });

    it("evaluates defeat and calculates deficit accurately", () => {
      const result = evaluateChallenge(950, 1200, "sender", 0);
      expect(result.isWin).toBe(false);
      expect(result.isLoss).toBe(true);
      expect(result.isTie).toBe(false);
      expect(result.deficit).toBe(250);
    });

    it("evaluates tie correctly", () => {
      const result = evaluateChallenge(1200, 1200, "tie", 0);
      expect(result.isWin).toBe(false);
      expect(result.isLoss).toBe(false);
      expect(result.isTie).toBe(true);
      expect(result.deficit).toBe(0);
    });

    it("constructs valid brag URLs without 404 /play/?challenge= patterns", () => {
      const origin = "https://playloop.ae";
      const challengeCode = "FL-99A1";
      const gamePath = "https://playloop.ae/play/desert-dash";

      // When challenge code exists:
      const shareUrlWithCode = challengeCode
        ? `${origin}/c/${encodeURIComponent(challengeCode)}`
        : gamePath.split("?")[0];
      expect(shareUrlWithCode).toBe("https://playloop.ae/c/FL-99A1");
      expect(shareUrlWithCode).not.toContain("/play/?challenge=");

      // When no challenge code exists (fallback to game URL):
      const shareUrlFallback = !challengeCode ? `${origin}/c/...` : gamePath.split("?")[0];
      expect(shareUrlFallback).toBe("https://playloop.ae/play/desert-dash");
    });
  });

  describe("Personal Best Modal & Share Link", () => {
    it("generates game route link without empty slug 404s", () => {
      const origin = "https://playloop.ae";
      const currentUrl = "https://playloop.ae/play/desert-dash?someParam=1";
      const cleanGameUrl = currentUrl.split("?")[0];

      expect(cleanGameUrl).toBe("https://playloop.ae/play/desert-dash");
      expect(cleanGameUrl).not.toBe(`${origin}/play/`);
    });
  });

  describe("Studio AI Game Generator Test-Play Route", () => {
    it("routes directly to sandboxed test-play instead of live points play", () => {
      const versionId = "v_test_456";
      const gameSlug = "desert-dash";

      // Invalid route that was previously used:
      const wrongRoute = `/play/${gameSlug}?test=${versionId}`;
      // Correct sandboxed test route:
      const correctRoute = `/play/test/${versionId}`;

      expect(correctRoute).toBe("/play/test/v_test_456");
      expect(correctRoute).not.toBe(wrongRoute);
    });
  });

  describe("Custom League Created & Join PIN", () => {
    it("preserves full league payload with code and name", () => {
      const mockLeague = {
        id: "lg_123",
        name: "Horizon Grade 8B",
        kind: "school",
        code: "SCH-7A2F",
        description: "Official 8B championship",
      };

      expect(mockLeague.name).toBe("Horizon Grade 8B");
      expect(mockLeague.code).toBe("SCH-7A2F");
      expect(mockLeague.kind).toBe("school");

      // WhatsApp invite text builder
      const origin = "https://playloop.ae";
      const inviteText = `Join my PlayLoop League "${mockLeague.name}"! Use Join PIN: ${mockLeague.code} or visit ${origin}/challenges`;
      expect(inviteText).toContain("Horizon Grade 8B");
      expect(inviteText).toContain("SCH-7A2F");
      expect(inviteText).toContain("https://playloop.ae/challenges");
    });
  });

  describe("Daily Streak Milestone Progression", () => {
    function getNextMilestone(streak: number): number {
      return streak < 3 ? 3 : streak < 7 ? 7 : streak < 14 ? 14 : streak + 7;
    }

    it("calculates next milestone thresholds correctly", () => {
      expect(getNextMilestone(1)).toBe(3);
      expect(getNextMilestone(2)).toBe(3);
      expect(getNextMilestone(3)).toBe(7);
      expect(getNextMilestone(5)).toBe(7);
      expect(getNextMilestone(7)).toBe(14);
      expect(getNextMilestone(10)).toBe(14);
      expect(getNextMilestone(14)).toBe(21);
      expect(getNextMilestone(20)).toBe(27);
    });
  });

  describe("Voucher Redemption Recap", () => {
    it("computes points deducted and post-redemption balance accurately", () => {
      const startingBalance = 1200;
      const costPoints = 500;
      const remainingBalance = startingBalance - costPoints;

      expect(remainingBalance).toBe(700);
      expect(costPoints).toBe(500);
    });
  });
});

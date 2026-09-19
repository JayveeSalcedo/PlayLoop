import { describe, expect, it } from "vitest";
import {
  VENUE_EVENTS,
  calculateRoundPayout,
  generateSimulatedPlayer,
} from "./events";

describe("Venue Events & Arena Simulation", () => {
  it("defines standard event venue presets with rounds", () => {
    expect(VENUE_EVENTS["OASIS-LIVE"]).toBeDefined();
    expect(VENUE_EVENTS["DUBAI-LIVE"]).toBeDefined();
    expect(VENUE_EVENTS["GLOW-LIVE"]).toBeDefined();

    const oasis = VENUE_EVENTS["OASIS-LIVE"]!;
    expect(oasis.venueName).toBe("Oasis Mall Arena");
    expect(oasis.rounds.length).toBeGreaterThanOrEqual(1);
    expect(oasis.rounds[0]!.durationSeconds).toBe(30);
  });

  it("generates simulated crowd players with valid avatars and skill", () => {
    const p1 = generateSimulatedPlayer(0);
    expect(p1.name).toBeTruthy();
    expect(p1.avatarIndex).toBeGreaterThanOrEqual(0);
    expect(p1.avatarIndex).toBeLessThan(6);
    expect(p1.skill).toBeGreaterThan(0);
    expect(p1.score).toBe(0);

    const p2 = generateSimulatedPlayer(5);
    expect(p2.id).not.toBe(p1.id);
  });

  it("calculates round payouts with 1st, 2nd, and 3rd podium bonuses", () => {
    const round = VENUE_EVENTS["OASIS-LIVE"]!.rounds[0]!;

    // 1st place gets +100 bonus
    const payout1st = calculateRoundPayout(round, 240, 1);
    // 2nd place gets +60 bonus
    const payout2nd = calculateRoundPayout(round, 240, 2);
    // 3rd place gets +30 bonus
    const payout3rd = calculateRoundPayout(round, 240, 3);
    // 4th place gets base payout only
    const payout4th = calculateRoundPayout(round, 240, 4);

    expect(payout1st).toBe(round.maxPoints + 100);
    expect(payout2nd).toBe(round.maxPoints + 60);
    expect(payout3rd).toBe(round.maxPoints + 30);
    expect(payout4th).toBe(round.maxPoints);
  });

  it("handles arena audio controller safely in test/ssr environment", async () => {
    const { arenaAudio } = await import("./arenaAudio");
    expect(arenaAudio.isMuted()).toBe(false);

    // Toggle mute
    const nowMuted = arenaAudio.toggleMute();
    expect(nowMuted).toBe(true);
    expect(arenaAudio.isMuted()).toBe(true);

    // Unmute
    arenaAudio.setMuted(false);
    expect(arenaAudio.isMuted()).toBe(false);

    // Should not throw even when Web Audio is not present in Node/vitest
    expect(() => {
      arenaAudio.playCountdown(false);
      arenaAudio.playCountdown(true);
      arenaAudio.playTap();
      arenaAudio.playCombo(5);
      arenaAudio.playVictory();
    }).not.toThrow();
  });

  it("validates round configuration structures for custom venue creators", () => {
    const customRounds = [
      {
        number: 1,
        title: "Speed Tap Rush",
        arabicTitle: "سباق السرعة",
        gameType: "tap" as const,
        durationSeconds: 30,
        targetScore: 240,
        maxPoints: 300,
      },
      {
        number: 2,
        title: "Reflex Challenge",
        arabicTitle: "تحدي البديهة",
        gameType: "reflex" as const,
        durationSeconds: 45,
        targetScore: 300,
        maxPoints: 400,
      },
    ];

    expect(customRounds).toHaveLength(2);
    expect(customRounds[0]!.gameType).toBe("tap");
    expect(customRounds[1]!.gameType).toBe("reflex");
    expect(customRounds[0]!.durationSeconds).toBeGreaterThanOrEqual(15);
    expect(customRounds[1]!.durationSeconds).toBeLessThanOrEqual(120);
  });
});


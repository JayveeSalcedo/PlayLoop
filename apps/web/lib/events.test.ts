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
});

import { describe, expect, it } from "vitest";
import { addXp, clamp, payout, scoreTarget, tier, voucherStatus, xpNeed } from "./index";

describe("clamp", () => {
  it("clamps within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});

describe("xpNeed", () => {
  it("grows linearly by 150 per level, starting at 200", () => {
    expect(xpNeed(1)).toBe(200);
    expect(xpNeed(2)).toBe(350);
    expect(xpNeed(3)).toBe(500);
  });
});

describe("tier", () => {
  it("maps levels to tier names, capping at the last tier", () => {
    expect(tier(1)).toBe("Rookie");
    expect(tier(3)).toBe("Challenger");
    expect(tier(100)).toBe("Legend");
  });
});

describe("addXp", () => {
  it("accumulates xp without leveling up when below threshold", () => {
    const r = addXp({ xp: 0, level: 1 }, 100);
    expect(r).toEqual({ xp: 100, level: 1, levelsGained: 0 });
  });

  it("levels up once when crossing exactly one threshold", () => {
    // xpNeed(1) = 200
    const r = addXp({ xp: 150, level: 1 }, 100);
    expect(r.level).toBe(2);
    expect(r.levelsGained).toBe(1);
    expect(r.xp).toBe(50);
  });

  it("can roll over multiple level-ups from one large gain", () => {
    // xpNeed(1)=200, xpNeed(2)=350 -> total 550 to reach level 3
    const r = addXp({ xp: 0, level: 1 }, 600);
    expect(r.level).toBe(3);
    expect(r.levelsGained).toBe(2);
    expect(r.xp).toBe(50);
  });
});

describe("payout", () => {
  it("scales linearly with score toward target, capped at maxPoints", () => {
    expect(payout(200, 0, 420)).toBe(15); // floors at 15
    expect(payout(200, 420, 420)).toBe(200); // hits target exactly
    expect(payout(200, 840, 420)).toBe(200); // over target, capped
    expect(payout(200, 210, 420)).toBe(100); // half target -> half points
  });

  it("never returns less than 15 even for a tiny score", () => {
    expect(payout(200, 1, 420)).toBe(15);
  });
});

describe("scoreTarget", () => {
  it("returns fixed targets for arcade types", () => {
    expect(scoreTarget("catch")).toBe(420);
    expect(scoreTarget("reflex")).toBe(560);
    expect(scoreTarget("memory")).toBe(420);
  });

  it("scales quiz target with question count", () => {
    expect(scoreTarget("quiz", 5)).toBe(600);
    expect(scoreTarget("quiz", 1)).toBe(120);
    expect(scoreTarget("quiz", 0)).toBe(120); // floors at 1 question
  });
});

describe("voucherStatus", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  const future = new Date("2026-01-20T00:00:00Z");
  const past = new Date("2026-01-10T00:00:00Z");

  it("is active before expiry and unredeemed", () => {
    expect(voucherStatus({ redeemedAt: null, expiresAt: future }, now)).toBe("active");
  });

  it("is expired once past expiresAt", () => {
    expect(voucherStatus({ redeemedAt: null, expiresAt: past }, now)).toBe("expired");
  });

  it("is redeemed even if also past its expiry date", () => {
    expect(voucherStatus({ redeemedAt: past, expiresAt: past }, now)).toBe("redeemed");
  });
});

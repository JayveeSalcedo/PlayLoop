import { describe, expect, it } from "vitest";
import {
  addXp,
  BOT_TARGET_FACTOR,
  campaignStatus,
  challengeOutcome,
  codeScoreTarget,
  clamp,
  costPer,
  formatAed,
  payout,
  scoreTarget,
  tier,
  voucherStatus,
  xpNeed,
} from "./index";

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

  it("targets merge at the exact minimum score a 1024 win requires", () => {
    expect(scoreTarget("merge")).toBe(9216);
  });

  it("targets slide at solving with roughly half the clock left", () => {
    expect(scoreTarget("slide")).toBe(450);
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

describe("challengeOutcome", () => {
  it("sender wins with a higher score", () => {
    expect(challengeOutcome(500, 300)).toBe("sender");
  });

  it("recipient wins with a higher score", () => {
    expect(challengeOutcome(300, 500)).toBe("recipient");
  });

  it("is a tie on equal scores", () => {
    expect(challengeOutcome(400, 400)).toBe("tie");
  });
});

describe("campaignStatus", () => {
  const funded = new Date("2026-01-01T00:00:00Z");
  const on = (day: string) => new Date(`${day}T12:00:00Z`);
  const window = { startsOn: "2026-03-10", endsOn: "2026-03-20" };
  const live = { ...window, fundedAt: funded, cancelledAt: null };

  it("is live inside its window once funded", () => {
    expect(campaignStatus(live, on("2026-03-15"))).toBe("live");
  });

  it("treats both bounds as inclusive", () => {
    expect(campaignStatus(live, on("2026-03-10"))).toBe("live");
    expect(campaignStatus(live, on("2026-03-20"))).toBe("live");
  });

  it("is scheduled before the window and complete after it", () => {
    expect(campaignStatus(live, on("2026-03-09"))).toBe("scheduled");
    expect(campaignStatus(live, on("2026-03-21"))).toBe("complete");
  });

  it("is a draft until funded, whatever the dates say", () => {
    const unfunded = { ...window, fundedAt: null, cancelledAt: null };
    // The important one: an unfunded campaign whose window has opened must not
    // read as live, or a brand sees a dashboard for something it hasn't paid for.
    expect(campaignStatus(unfunded, on("2026-03-15"))).toBe("draft");
    expect(campaignStatus(unfunded, on("2026-03-01"))).toBe("draft");
    expect(campaignStatus(unfunded, on("2026-04-01"))).toBe("draft");
  });

  it("is cancelled regardless of funding or dates", () => {
    const cancelled = { ...window, fundedAt: funded, cancelledAt: new Date("2026-03-12T00:00:00Z") };
    expect(campaignStatus(cancelled, on("2026-03-15"))).toBe("cancelled");
    expect(campaignStatus({ ...cancelled, fundedAt: null }, on("2026-03-15"))).toBe("cancelled");
  });

  it("handles a single-day campaign", () => {
    const oneDay = { startsOn: "2026-03-10", endsOn: "2026-03-10", fundedAt: funded, cancelledAt: null };
    expect(campaignStatus(oneDay, on("2026-03-10"))).toBe("live");
    expect(campaignStatus(oneDay, on("2026-03-11"))).toBe("complete");
  });
});

describe("formatAed", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatAed(0)).toBe("AED 0.00");
    expect(formatAed(500_000)).toBe("AED 5,000.00");
    expect(formatAed(1)).toBe("AED 0.01");
    expect(formatAed(12_345)).toBe("AED 123.45");
  });

  it("pads the minor units", () => {
    expect(formatAed(105)).toBe("AED 1.05");
    expect(formatAed(100)).toBe("AED 1.00");
  });

  it("keeps a negative sign in front", () => {
    expect(formatAed(-2_550)).toBe("-AED 25.50");
  });
});

describe("costPer", () => {
  it("divides the budget across a count", () => {
    expect(costPer(500_000, 100)).toBe(5_000);
  });

  it("rounds to whole fils", () => {
    expect(costPer(1000, 3)).toBe(333);
  });

  it("is null rather than zero when there's nothing to divide by", () => {
    // "AED 0.00 per play" would read as free; no plays means no cost per play.
    expect(costPer(500_000, 0)).toBeNull();
    expect(costPer(500_000, -1)).toBeNull();
  });
});

describe("codeScoreTarget", () => {
  const run = (bot: string, score?: number, ok = true) => ({ bot, ok, score });

  it("targets a fraction of the best active bot score", () => {
    const runs = [run("explorer", 100), run("masher", 200), run("explorer", 150)];
    expect(codeScoreTarget(runs)).toBe(Math.round(BOT_TARGET_FACTOR * 200));
  });

  it("ignores the idle bot", () => {
    // The idle bot measures what the game pays for doing nothing. Letting it
    // set the target would reward players for not playing.
    const runs = [run("idle", 5000), run("explorer", 100)];
    expect(codeScoreTarget(runs)).toBe(Math.round(BOT_TARGET_FACTOR * 100));
  });

  it("ignores runs that crashed", () => {
    const runs = [run("masher", 900, false), run("explorer", 100)];
    expect(codeScoreTarget(runs)).toBe(Math.round(BOT_TARGET_FACTOR * 100));
  });

  it("is null when no active bot ever scored", () => {
    // Not a verdict on the game — just that there's nothing to calibrate
    // against, so the play falls back to payout()'s floor.
    expect(codeScoreTarget([run("idle", 40)])).toBeNull();
    expect(codeScoreTarget([run("explorer", 0), run("masher", 0)])).toBeNull();
    expect(codeScoreTarget([run("explorer", undefined)])).toBeNull();
    expect(codeScoreTarget([])).toBeNull();
  });

  it("never targets zero, which would make every play pay the maximum", () => {
    expect(codeScoreTarget([run("explorer", 1)])).toBe(1);
  });

  it("lets a player who matches the bots earn the full payout", () => {
    const target = codeScoreTarget([run("explorer", 200)])!;
    expect(payout(200, 200, target)).toBe(200);
    // And someone well short of the bots still earns something.
    expect(payout(200, 40, target)).toBeGreaterThan(15);
    expect(payout(200, 40, target)).toBeLessThan(200);
  });
});

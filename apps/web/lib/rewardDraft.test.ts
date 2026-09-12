import { describe, expect, it } from "vitest";
import { validateRewardDraft, type RewardDraft } from "./rewardDraft";

const valid: RewardDraft = {
  name: "Free flat white",
  description: "Redeem at any store.",
  brandId: "11111111-1111-1111-1111-111111111111",
  category: "Food and drink",
  costPoints: 500,
  theme: "ember",
  icon: "cup",
  poolTotal: 1000,
  poolRemaining: 1000,
};

const fields = (d: RewardDraft) => validateRewardDraft(d).map((i) => i.field);

describe("validateRewardDraft", () => {
  it("accepts a well-formed reward", () => {
    expect(validateRewardDraft(valid)).toEqual([]);
  });

  it("accepts an uncapped reward with no pool", () => {
    expect(validateRewardDraft({ ...valid, poolTotal: null, poolRemaining: null })).toEqual([]);
  });

  it("requires a name within bounds", () => {
    expect(fields({ ...valid, name: "   " })).toContain("name");
    expect(fields({ ...valid, name: "x".repeat(41) })).toContain("name");
  });

  it("requires a brand and a known category", () => {
    expect(fields({ ...valid, brandId: "" })).toContain("brandId");
    expect(fields({ ...valid, category: "Groceries" })).toContain("category");
  });

  it("requires a whole, positive, in-range cost", () => {
    expect(fields({ ...valid, costPoints: 0 })).toContain("costPoints");
    expect(fields({ ...valid, costPoints: -5 })).toContain("costPoints");
    expect(fields({ ...valid, costPoints: 12.5 })).toContain("costPoints");
    expect(fields({ ...valid, costPoints: 100_001 })).toContain("costPoints");
  });

  it("rejects an unknown theme or icon", () => {
    expect(fields({ ...valid, theme: "chartreuse" })).toContain("theme");
    expect(fields({ ...valid, icon: "rocket" })).toContain("icon");
  });

  it("refuses more remaining than the pool ever held", () => {
    // Otherwise the pool bar reads over 100% and more can be claimed than funded.
    expect(fields({ ...valid, poolTotal: 100, poolRemaining: 101 })).toContain("poolRemaining");
    expect(fields({ ...valid, poolTotal: 100, poolRemaining: -1 })).toContain("poolRemaining");
    expect(validateRewardDraft({ ...valid, poolTotal: 100, poolRemaining: 0 })).toEqual([]);
  });

  it("refuses a remaining count on an uncapped reward", () => {
    expect(fields({ ...valid, poolTotal: null, poolRemaining: 5 })).toContain("poolRemaining");
  });

  it("requires a whole, positive pool when one is set", () => {
    expect(fields({ ...valid, poolTotal: 0, poolRemaining: 0 })).toContain("poolTotal");
    expect(fields({ ...valid, poolTotal: 10.5, poolRemaining: 1 })).toContain("poolTotal");
  });
});

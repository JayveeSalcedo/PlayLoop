import { scoreTarget } from "@playloop/economy";
import { describe, expect, it } from "vitest";
import { COUNTDOWN_SECONDS, playRules, validatePlay, type PlayableType } from "./rules";

describe("playRules", () => {
  it("requires a timed game to have run its full length", () => {
    expect(playRules("catch", { difficulty: "Medium" }).minSeconds).toBeCloseTo(COUNTDOWN_SECONDS + 25 - 1);
    expect(playRules("reflex", { difficulty: "Medium" }).minSeconds).toBeCloseTo(COUNTDOWN_SECONDS + 20 - 1);
  });

  it("scales quiz bounds with question count", () => {
    const r = playRules("quiz", { difficulty: "Medium", questionCount: 5 });
    expect(r.minSeconds).toBeCloseTo(COUNTDOWN_SECONDS + 5);
    expect(r.maxScore).toBe(750);
  });

  it("caps memory at 6 matches plus the full time bonus", () => {
    expect(playRules("memory", { difficulty: "Medium" }).maxScore).toBe(525);
  });

  it("allows a higher ceiling on harder (faster-spawning) difficulties", () => {
    const easy = playRules("catch", { difficulty: "Easy" }).maxScore;
    const hard = playRules("catch", { difficulty: "Hard" }).maxScore;
    expect(hard).toBeGreaterThan(easy);
  });

  it("never caps a legit player below the score needed for full payout", () => {
    const types: PlayableType[] = ["catch", "reflex", "memory", "quiz"];
    for (const type of types) {
      const r = playRules(type, { difficulty: "Easy", questionCount: 5 });
      expect(r.maxScore).toBeGreaterThanOrEqual(scoreTarget(type, 5));
    }
  });
});

describe("validatePlay", () => {
  const rules = playRules("catch", { difficulty: "Medium" });

  it("accepts a plausible play", () => {
    expect(validatePlay({ elapsedSeconds: 28, score: 400 }, rules)).toEqual({ ok: true });
  });

  it("rejects a submission faster than the game can run", () => {
    expect(validatePlay({ elapsedSeconds: 3, score: 400 }, rules)).toEqual({ ok: false, reason: "too_fast" });
  });

  it("rejects a stale session", () => {
    expect(validatePlay({ elapsedSeconds: 3600, score: 400 }, rules)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a score above the analytic ceiling", () => {
    expect(validatePlay({ elapsedSeconds: 28, score: rules.maxScore + 1 }, rules)).toEqual({
      ok: false,
      reason: "score_implausible",
    });
  });

  it("rejects negative or fractional scores", () => {
    expect(validatePlay({ elapsedSeconds: 28, score: -5 }, rules)).toEqual({ ok: false, reason: "invalid_score" });
    expect(validatePlay({ elapsedSeconds: 28, score: 10.5 }, rules)).toEqual({ ok: false, reason: "invalid_score" });
  });
});

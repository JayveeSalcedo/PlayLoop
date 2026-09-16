import { describe, expect, it } from "vitest";
import { isVerifierProblem, MAX_LOG_BYTES, precheckSubmission, rejectionMessage } from "./codePlay";

const log = (ticks: number, events: number[] = []) => ({ v: 1, ticks, events });

describe("precheckSubmission", () => {
  it("accepts a play that took at least as long as it claims", () => {
    // 25 s of game time, 28 s after startPlay (countdown + network).
    const r = precheckSubmission({ score: 80, log: log(1500) }, 28);
    expect(r).toMatchObject({ ok: true, score: 80, ticks: 1500 });
    if (r.ok) expect(JSON.parse(r.logJson)).toEqual(log(1500));
  });

  it("accepts the log as a pre-serialized string too", () => {
    expect(precheckSubmission({ score: 0, log: JSON.stringify(log(60)) }, 5).ok).toBe(true);
  });

  it("rejects a log claiming more play than real time allows", () => {
    // 60 s of game time submitted 2 s after the session started: fabricated.
    expect(precheckSubmission({ score: 999, log: log(3600) }, 2)).toMatchObject({ ok: false, reason: "too_fast" });
  });

  it("tolerates a sliver of timer and network slack, but no more", () => {
    expect(precheckSubmission({ score: 1, log: log(60) }, 0.6).ok).toBe(true);
    expect(precheckSubmission({ score: 1, log: log(120) }, 1).ok).toBe(false);
  });

  it("rejects a non-integer or negative score", () => {
    for (const score of [-1, 1.5, "80", null, undefined, Number.NaN]) {
      expect(precheckSubmission({ score, log: log(60) }, 5)).toMatchObject({ ok: false, reason: "invalid_score" });
    }
  });

  it("rejects a missing, unparseable or tickless log", () => {
    expect(precheckSubmission({ score: 1 }, 5)).toMatchObject({ ok: false, reason: "bad_log" });
    expect(precheckSubmission({ score: 1, log: "{nope" }, 5)).toMatchObject({ ok: false, reason: "bad_log" });
    expect(precheckSubmission({ score: 1, log: { v: 1, events: [] } }, 5)).toMatchObject({ ok: false, reason: "bad_log" });
    expect(precheckSubmission({ score: 1, log: log(0) }, 5)).toMatchObject({ ok: false, reason: "bad_log" });
  });

  it("rejects an oversized log without keeping it", () => {
    const r = precheckSubmission({ score: 1, log: log(60, new Array(MAX_LOG_BYTES).fill(0)) }, 5);
    expect(r).toMatchObject({ ok: false, reason: "too_large", logJson: null });
  });

  it("rejects a submission long after the session was issued", () => {
    expect(precheckSubmission({ score: 1, log: log(60) }, 60 * 60)).toMatchObject({ ok: false, reason: "expired" });
  });
});

describe("rejection copy", () => {
  it("tells the player to retry, without accusing them, when our side failed", () => {
    for (const reason of ["timeout", "out_of_memory", "runtime_mismatch", "verifier_error"]) {
      expect(isVerifierProblem(reason)).toBe(true);
      expect(rejectionMessage(reason)).toMatch(/Nothing was charged/);
    }
  });

  it("doesn't explain how a forgery was caught", () => {
    for (const reason of ["score_mismatch", "tick_mismatch", "bad_log", "too_fast"]) {
      expect(isVerifierProblem(reason)).toBe(false);
      expect(rejectionMessage(reason)).not.toMatch(/score|tick|log/i);
    }
  });
});

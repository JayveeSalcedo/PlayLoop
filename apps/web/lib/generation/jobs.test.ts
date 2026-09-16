import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createState, type PipelineState } from "@playloop/ai";
import { describe, expect, it } from "vitest";
import { HEARTBEAT_EVERY_MS, slimState, STALE_RUNNING_MS, STEP_MAX_DURATION_MS, toView, usageOf } from "./jobs";

const attempt = (usage: [number, number], withOutput = true) => ({
  round: 0,
  task: "create" as const,
  model: "m",
  usage: { inputTokens: usage[0], outputTokens: usage[1] },
  latencyMs: 1,
  output: withOutput ? { title: "T", summary: "S", code: "x".repeat(10_000), notes: "" } : null,
  report: withOutput ? ({ verdict: "fail" } as never) : null,
  error: null,
});

describe("saved pipeline state", () => {
  it("drops each attempt's code and report but keeps the best game whole", () => {
    const best = { title: "T", summary: "S", code: "best code", notes: "", report: { verdict: "fail" } as never };
    const state: PipelineState = { ...createState("idea"), best, attempts: [attempt([10, 5]), attempt([20, 5])] };
    const slim = slimState(state);
    expect(slim.attempts.every((a) => a.output === null && a.report === null)).toBe(true);
    expect(slim.best).toBe(best);
    // finish() reads usage and models from attempts, so those must survive.
    expect(slim.attempts.map((a) => [a.model, a.usage])).toEqual(state.attempts.map((a) => [a.model, a.usage]));
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(state).length / 5);
  });

  it("counts calls and tokens across every round so far", () => {
    const state: PipelineState = { ...createState("idea"), attempts: [attempt([100, 50], false), attempt([200, 25], false)] };
    expect(usageOf(state)).toEqual({ calls: 2, tokens: 375 });
  });
});

describe("timing", () => {
  it("the step route's maxDuration matches the limit deadlines are derived from", () => {
    // Route segment config must be a literal, so this can't share the constant.
    const route = readFileSync(resolve(__dirname, "../../app/api/studio/jobs/[id]/step/route.ts"), "utf8");
    expect(route).toContain(`export const maxDuration = ${STEP_MAX_DURATION_MS / 1000};`);
  });

  it("gives a running step several missed heartbeats before calling it dead", () => {
    expect(STALE_RUNNING_MS).toBeGreaterThanOrEqual(HEARTBEAT_EVERY_MS * 3);
  });
});

describe("toView", () => {
  it("never exposes the saved state or the profile", () => {
    const view = toView({
      id: "j",
      profileId: "p",
      gameId: null,
      baseVersionId: null,
      kind: "create",
      status: "queued",
      request: "idea",
      state: { secret: true },
      events: [],
      resultVersionId: null,
      problem: null,
      calls: 0,
      tokens: 0,
      provider: null,
      model: null,
      promptVersion: null,
      heartbeatAt: null,
      createdAt: new Date("2026-09-16T00:00:00Z"),
      finishedAt: null,
    });
    expect(view).not.toHaveProperty("state");
    expect(view).not.toHaveProperty("profileId");
    expect(view.createdAt).toBe("2026-09-16T00:00:00.000Z");
  });
});

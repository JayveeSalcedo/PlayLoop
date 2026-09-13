import type { LabReport } from "@playloop/replay";
import { describe, expect, it } from "vitest";
import { changeGame, createGame, type ProgressEvent } from "../src/pipeline";
import { parseGameOutput } from "../src/output";
import { estimateTokens, SYSTEM_PROMPT } from "../src/prompts";
import { getProvider } from "../src/registry";
import { AiError, type AiProvider, type GenerateRequest } from "../src/types";

const GOOD = `playloop.game({ meta: { title: "Good", hint: "Tap", maxSeconds: 20 }, init: () => ({}), update() {} });`;
const BROKEN = `playloop.game({ meta: { title: "Broken", hint: "Tap", maxSeconds: 20 }, init: () => ({}), update() { Math.random(); } });`;

function fakeReport(code: string): LabReport {
  const pass = code === GOOD;
  return {
    version: 1,
    codeHash: "x",
    checkedAt: new Date().toISOString(),
    verdict: pass ? "pass" : "fail",
    meta: null,
    checks: [
      { id: "contract", title: "Game contract", status: "pass", summary: "ok", details: [] },
      { id: "code-scan", title: "Code scan", status: pass ? "pass" : "fail", summary: pass ? "ok" : "Uses Math.random().", details: [] },
    ],
    runs: [],
    replayCost: null,
    durationMs: 1,
    fixPrompt: pass ? null : "LAB: replace Math.random with ctx.random",
  };
}

/** A provider that replays scripted answers (or errors) and records every request. */
function scripted(responses: (string | AiError)[]): AiProvider & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  return {
    id: "groq",
    requests,
    capabilities: { strictJson: true, tokensPerMinute: 8000, maxOutputTokens: 6000, pricePerMillion: null },
    model: () => "fake-model",
    async generate(request) {
      requests.push(request);
      const next = responses.shift();
      if (next === undefined) throw new Error("No scripted response left");
      if (next instanceof AiError) throw next;
      return { json: { title: "T", summary: "S", code: next, notes: "" }, model: "fake-model", usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 1 };
    },
  };
}

const base = { check: async (code: string) => fakeReport(code), sleep: async () => {} };

describe("createGame", () => {
  it("returns on the first passing game", async () => {
    const provider = scripted([GOOD]);
    const result = await createGame("a game", { ...base, provider });
    expect(result).toMatchObject({ ok: true, problem: null, game: { code: GOOD } });
    expect(result.attempts).toHaveLength(1);
    expect(provider.requests[0]!.task).toBe("create");
  });

  it("sends the lab report back and uses the fixed version", async () => {
    const provider = scripted([BROKEN, GOOD]);
    const events: ProgressEvent[] = [];
    const result = await createGame("a game", { ...base, provider, onProgress: (e) => events.push(e) });
    expect(result.ok).toBe(true);
    expect(result.attempts.map((a) => a.task)).toEqual(["create", "fix"]);
    const fix = provider.requests[1]!.messages[0]!.content;
    expect(fix).toContain(BROKEN);
    expect(fix).toContain("LAB: replace Math.random with ctx.random");
    expect(events.map((e) => e.step)).toEqual(["writing", "checking", "fixing", "checking", "done"]);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it("stops after the fix rounds and keeps the last loadable game with the reason", async () => {
    const provider = scripted([BROKEN, BROKEN, BROKEN]);
    const result = await createGame("a game", { ...base, provider, maxFixRounds: 2 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(3);
    expect(result.game?.code).toBe(BROKEN);
    expect(result.problem).toContain("Code scan");
  });

  it("waits out rate limits, reporting how long", async () => {
    const waits: number[] = [];
    const provider = scripted([new AiError("rate_limited", "busy", { retryAfterMs: 12_000 }), GOOD]);
    const events: ProgressEvent[] = [];
    const result = await createGame("a game", { ...base, provider, sleep: async (ms) => void waits.push(ms), onProgress: (e) => events.push(e) });
    expect(result.ok).toBe(true);
    expect(waits).toEqual([12_000]);
    expect(events.find((e) => e.step === "waiting")?.message).toMatch(/12 s/);
    expect(result.attempts).toHaveLength(1);
  });

  it("doesn't retry errors that retrying can't fix", async () => {
    const provider = scripted([new AiError("auth", "bad key")]);
    const result = await createGame("a game", { ...base, provider });
    expect(result).toMatchObject({ ok: false, game: null, problem: "bad key" });
    expect(provider.requests).toHaveLength(1);
  });

  it("retries a malformed answer as the next round", async () => {
    const provider = scripted([new AiError("bad_output", "not json"), GOOD]);
    const result = await createGame("a game", { ...base, provider });
    expect(result.ok).toBe(true);
    expect(result.attempts[0]!.error?.kind).toBe("bad_output");
  });

  it("keeps Groq requests under its per-minute token cap", async () => {
    const provider = scripted([GOOD]);
    await createGame("a game", { ...base, provider });
    const r = provider.requests[0]!;
    expect(estimateTokens(r.system) + estimateTokens(r.messages[0]!.content) + r.maxOutputTokens).toBeLessThanOrEqual(8000);
  });

  it("refuses an empty idea without calling the AI", async () => {
    const provider = scripted([]);
    expect(await createGame("   ", { ...base, provider })).toMatchObject({ ok: false, problem: expect.stringMatching(/Describe/) });
    expect(provider.requests).toHaveLength(0);
  });
});

describe("changeGame", () => {
  it("sends the current code and the requested change", async () => {
    const provider = scripted([GOOD]);
    const result = await changeGame(BROKEN, "make it harder", { ...base, provider });
    expect(result.ok).toBe(true);
    expect(provider.requests[0]!.task).toBe("change");
    expect(provider.requests[0]!.messages[0]!.content).toContain("make it harder");
  });
});

describe("output parsing and config", () => {
  it("unwraps fenced code and rejects answers without a game", () => {
    expect(parseGameOutput({ title: "a", summary: "b", code: "```js\n" + GOOD + "\n```", notes: "" }).code).toBe(GOOD);
    expect(() => parseGameOutput({ title: "a", summary: "b", code: "console.log(1)", notes: "" })).toThrow(/playloop\.game/);
    expect(() => parseGameOutput({ title: "a" })).toThrow(/missing/);
  });

  it("keeps the system prompt compact enough for Groq's free tier", () => {
    expect(estimateTokens(SYSTEM_PROMPT)).toBeLessThan(2000);
  });

  it("selects the provider from env and explains missing keys", () => {
    expect(() => getProvider({})).toThrow(/GROQ_API_KEY/);
    expect(() => getProvider({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => getProvider({ AI_PROVIDER: "openai" })).toThrow(/groq.*anthropic/);
    expect(getProvider({ GROQ_API_KEY: "test" }).id).toBe("groq");
    const anthropic = getProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test", AI_MODEL_FIX: "claude-sonnet-5" });
    expect([anthropic.id, anthropic.model("create"), anthropic.model("fix")]).toEqual(["anthropic", "claude-opus-5", "claude-sonnet-5"]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { playWithBot } from "../../runtime/test/realm";
import { verifyPlay } from "../src/verify";

const examples = resolve(__dirname, "../../runtime/examples");
const CATCH = readFileSync(resolve(examples, "catch.js"), "utf8");
const DASH = readFileSync(resolve(examples, "desert-dash.js"), "utf8");

const game = (body: string, meta = `{ title: "Test", hint: "Test game", maxSeconds: 5 }`) =>
  `playloop.game({ meta: ${meta}, init: () => ({ n: 0 }), update(s, input, ctx) { ${body} } });`;

describe("browser (V8) play → server (QuickJS) replay", () => {
  const cases = [
    ["catch.js", CATCH],
    ["desert-dash.js", DASH],
  ] as const;

  for (const [name, code] of cases) {
    it(`${name}: 12 bot plays replay to the identical score and state hash`, async () => {
      for (let i = 0; i < 12; i++) {
        const play = playWithBot(code, `session-${name}-${i}`, 1000 + i);
        // Every 4th play goes through the killable worker, the rest inline for speed; both must agree.
        const isolate = i % 4 === 0 ? "worker" : "inline";
        const result = await verifyPlay({ code, seed: `session-${name}-${i}`, log: play.log, claimedScore: play.score, timeLimitMs: 10_000, isolate });
        if (!result.ok) throw new Error(`${name} play ${i}: ${result.reason} — ${result.detail}`);
        expect(result.score).toBe(play.score);
        expect(result.ticks).toBe(play.ticks);
        expect(result.hash).toBe(play.hash);
        expect(result.endReason).toBe(play.endReason);
      }
    }, 120_000);
  }

  it("a full-length game replays well inside the 2 s budget", async () => {
    const play = playWithBot(CATCH, "budget", 3);
    expect(play.ticks).toBe(25 * 60);
    const result = await verifyPlay({ code: CATCH, seed: "budget", log: play.log, claimedScore: play.score });
    expect(result.ok).toBe(true);
    console.log(`catch.js: ${play.ticks} ticks verified in ${result.elapsedMs} ms (worker, incl. startup)`);
  }, 30_000);

  // Measurement, not a budget check: QuickJS is an interpreter, and this game
  // takes ~7 s to verify (≈4 µs per body per tick). Games this heavy must be
  // caught by the game lab's replay-cost gate or verified asynchronously —
  // see packages/replay/README.md.
  it("a busy 90 s game (300 moving bodies) replays identically; cost is logged", async () => {
    const heavy = `playloop.game({
      meta: { title: "Stress", hint: "Stress test", maxSeconds: 90 },
      init(ctx) { const b = []; for (let i = 0; i < 300; i++) b.push({ x: ctx.random() * 360, y: ctx.random() * 640, vx: ctx.random() * 4 - 2, vy: ctx.random() * 4 - 2 }); return { b }; },
      update(s, input, ctx) {
        for (const p of s.b) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > 360) p.vx = -p.vx;
          if (p.y < 0 || p.y > 640) p.vy = -p.vy;
          if (Math.hypot(p.x - input.pointer.x, p.y - input.pointer.y) < 20) ctx.score(1);
        }
      },
    });`;
    const play = playWithBot(heavy, "stress", 5);
    expect(play.ticks).toBe(90 * 60);
    const result = await verifyPlay({ code: heavy, seed: "stress", log: play.log, claimedScore: play.score, timeLimitMs: 20_000 });
    if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
    expect(result.hash).toBe(play.hash);
    console.log(`stress: ${play.ticks} ticks × 300 bodies verified in ${result.elapsedMs} ms`);
  }, 60_000);
});

describe("tampering is rejected", () => {
  const play = playWithBot(CATCH, "tamper", 99);

  it("a higher claimed score", async () => {
    const r = await verifyPlay({ code: CATCH, seed: "tamper", log: play.log, claimedScore: play.score + 10 });
    expect(r).toMatchObject({ ok: false, reason: "score_mismatch", replayScore: play.score });
  });

  it("inputs swapped for a different play", async () => {
    expect(play.score).toBeGreaterThan(0);
    const idle = { ...play.log, events: [] };
    const r = await verifyPlay({ code: CATCH, seed: "tamper", log: idle, claimedScore: play.score });
    expect(r).toMatchObject({ ok: false, reason: "score_mismatch" });
  });

  it("the right inputs replayed against a different seed", async () => {
    const r = await verifyPlay({ code: CATCH, seed: "another-seed", log: play.log, claimedScore: play.score });
    expect(r.ok).toBe(false);
  });

  it("a claimed tick count that doesn't match the game", async () => {
    const r = await verifyPlay({ code: CATCH, seed: "tamper", log: { ...play.log, ticks: play.ticks - 300 }, claimedScore: play.score });
    expect(r).toMatchObject({ ok: false, reason: "tick_mismatch" });
  });

  it("input after the game ended", async () => {
    const events = [...play.log.events, 5000, 3, 4];
    const r = await verifyPlay({ code: CATCH, seed: "tamper", log: { ...play.log, events }, claimedScore: play.score });
    expect(r).toMatchObject({ ok: false, reason: "events_after_end" });
  });

  it("a malformed log", async () => {
    const r = await verifyPlay({ code: CATCH, seed: "tamper", log: "{not json", claimedScore: 0 });
    expect(r).toMatchObject({ ok: false, reason: "bad_log" });
    const r2 = await verifyPlay({ code: CATCH, seed: "tamper", log: { v: 1, ticks: 1500, events: [0, 0, 1, -4, 2] } });
    expect(r2).toMatchObject({ ok: false, reason: "bad_log" });
  });

  it("an oversized log or game", async () => {
    const r = await verifyPlay({ code: CATCH, seed: "x", log: { v: 1, ticks: 1, events: new Array(120_000).fill(0) } });
    expect(r).toMatchObject({ ok: false, reason: "too_large" });
    const r2 = await verifyPlay({ code: "//" + "x".repeat(70_000), seed: "x", log: play.log });
    expect(r2).toMatchObject({ ok: false, reason: "too_large" });
  });
});

describe("hostile or broken game code is contained", () => {
  const oneTickLog = (ticks = 300) => ({ v: 1, ticks, events: [] });

  it("syntax errors", async () => {
    const r = await verifyPlay({ code: "playloop.game({ meta: ", seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "compile_error" });
  });

  it("missing playloop.game()", async () => {
    const r = await verifyPlay({ code: "const x = 1;", seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "contract_error" });
  });

  it("invalid meta", async () => {
    const r = await verifyPlay({ code: game("", `{ title: "T", hint: "H", maxSeconds: 900 }`), seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "contract_error" });
    expect(r.ok ? "" : r.detail).toMatch(/maxSeconds/);
  });

  it("an exception inside update, with the tick it happened on", async () => {
    const r = await verifyPlay({ code: game(`if (ctx.tick === 42) s.missing.boom();`), seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "runtime_error", tick: 42 });
  });

  it("Math.random and Date.now, with a message the AI can act on", async () => {
    const r = await verifyPlay({ code: game(`s.n = Math.random();`), seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "runtime_error" });
    expect(r.ok ? "" : r.detail).toMatch(/ctx\.random/);
    const r2 = await verifyPlay({ code: game(`s.n = Date.now();`), seed: "x", log: oneTickLog() });
    expect(r2.ok ? "" : r2.detail).toMatch(/ctx\.time/);
  });

  it("no network or host APIs exist", async () => {
    const r = await verifyPlay({ code: game(`fetch("https://example.com");`), seed: "x", log: oneTickLog() });
    expect(r).toMatchObject({ ok: false, reason: "runtime_error" });
    const r2 = await verifyPlay({ code: game(`if (typeof process !== "undefined" || typeof require !== "undefined") ctx.score(1);`), seed: "x", log: oneTickLog() });
    expect(r2).toMatchObject({ ok: true, score: 0 });
  });

  it("an infinite loop hits the time limit", async () => {
    const r = await verifyPlay({ code: game(`while (true) {}`), seed: "x", log: oneTickLog(), timeLimitMs: 300 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(r.elapsedMs).toBeLessThan(3000);
  });

  it("a memory bomb is stopped by the memory limit or the hard kill, whichever comes first", async () => {
    const r = await verifyPlay({ code: game(`const a = []; for (;;) a.push(new Array(1e5).fill(1));`), seed: "x", log: oneTickLog(), timeLimitMs: 1000 });
    expect(r.ok).toBe(false);
    expect(["out_of_memory", "timeout"]).toContain(r.ok ? "" : r.reason);
    expect(r.elapsedMs).toBeLessThan(1000 + 1500 + 1000);
  }, 15_000);

  it("a native operation that never checks the deadline is still killed on time", async () => {
    const r = await verifyPlay({ code: game(`const big = []; for (let i = 0; i < 400; i++) big.push(new Array(1e5).fill(i)); s.n = big.length;`), seed: "x", log: oneTickLog(), timeLimitMs: 500, memoryLimitBytes: 256 * 1024 * 1024 });
    expect(r.ok).toBe(false);
    expect(r.elapsedMs).toBeLessThan(500 + 1500 + 1000);
  }, 15_000);

  it("score only moves through ctx and never goes negative", async () => {
    const r = await verifyPlay({ code: game(`if (ctx.tick === 0) ctx.score(-5); if (ctx.tick === 10) ctx.score(7.4); if (ctx.tick === 20) ctx.end(); if (ctx.tick > 20) ctx.score(99);`), seed: "x", log: oneTickLog(21) });
    expect(r).toMatchObject({ ok: true, score: 7, ticks: 21, endReason: "game_end" });
  });

  it("render can't change the score or advance the seeded random", async () => {
    // render never runs on the server, so this documents the browser-side guard via the session API.
    const { newRealm } = await import("../../runtime/test/realm");
    const vm = await import("node:vm");
    const ctx = newRealm(`playloop.game({ meta: { title: "T", hint: "H", maxSeconds: 5 }, init: () => ({}), update() {}, render(s, g, ctx) { ctx.score(100); } });`);
    expect(() => vm.runInContext(`const s = __pl.createSession("x"); __pl.game().render(s.state, null, s.renderContext);`, ctx)).toThrow(/can't be used in render/);
  });
});

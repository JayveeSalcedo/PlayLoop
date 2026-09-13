/**
 * Test helper: runs the prelude + a game inside a fresh V8 realm (node:vm),
 * the same engine family as Chrome, with a deterministic input bot. It stands
 * in for "a real player in the browser" when checking that the server replay
 * reproduces the play exactly. Not a security boundary — tests only.
 */
import vm from "node:vm";
import { PRELUDE_SOURCE } from "../src/generated/prelude";
import type { InputLog } from "../src/input";

export interface BrowserPlay {
  score: number;
  ticks: number;
  hash: string;
  endReason: string;
  log: InputLog;
}

export function newRealm(gameCode: string) {
  const context = vm.createContext({});
  vm.runInContext(PRELUDE_SOURCE, context, { filename: "prelude.js" });
  vm.runInContext(gameCode, context, { filename: "game.js" });
  return context;
}

/** Plays the whole game with a seeded bot and records its inputs like the browser host will. */
export function playWithBot(gameCode: string, seed: string, botSeed: number): BrowserPlay {
  const context = newRealm(gameCode);
  const script = `(() => {
    let r = ${botSeed >>> 0} || 1;
    const rand = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
    const session = __pl.createSession(${JSON.stringify(seed)});
    const rec = __pl.createRecorder();
    let down = false, px = 180, py = 320, action = false, left = false;
    while (!session.ended) {
      const t = session.tick;
      const events = [];
      if (!down && rand() < 0.05) {
        down = true; px = rand() * 360; py = rand() * 640;
        events.push({ type: 0, id: 0, x4: __pl.quantize(px, "x"), y4: __pl.quantize(py, "y") });
      } else if (down && rand() < 0.4) {
        px += (rand() - 0.5) * 60; py += (rand() - 0.5) * 40;
        events.push({ type: 1, id: 0, x4: __pl.quantize(px, "x"), y4: __pl.quantize(py, "y") });
      }
      if (down && rand() < 0.04) {
        down = false;
        events.push({ type: 2, id: 0, x4: __pl.quantize(px, "x"), y4: __pl.quantize(py, "y") });
      }
      if (rand() < 0.02) { action = !action; events.push({ type: action ? 3 : 4, key: 4 }); }
      if (rand() < 0.015) { left = !left; events.push({ type: left ? 3 : 4, key: 0 }); }
      for (const e of events) { session.push(e); rec.record(t, e); }
      session.step();
    }
    return JSON.stringify({ score: session.score, ticks: session.tick, hash: session.hash(), endReason: session.endReason, log: rec.toLog(session.tick) });
  })()`;
  return JSON.parse(vm.runInContext(script, context, { filename: "bot.js" }) as string) as BrowserPlay;
}

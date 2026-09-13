import { describe, expect, it } from "vitest";
import {
  createInputRecorder,
  createInputTracker,
  decodeInputLog,
  EV_KEY_DOWN,
  EV_KEY_UP,
  EV_POINTER_DOWN,
  EV_POINTER_MOVE,
  EV_POINTER_UP,
  quantize,
} from "../src/input";
import { createRng } from "../src/rng";

describe("input log", () => {
  it("round-trips events through the recorder and decoder", () => {
    const rec = createInputRecorder();
    rec.record(0, { type: EV_POINTER_DOWN, id: 0, x4: quantize(100.3, "x"), y4: quantize(200, "y") });
    rec.record(0, { type: EV_POINTER_MOVE, id: 0, x4: 404, y4: 800 });
    rec.record(7, { type: EV_KEY_DOWN, key: 4 });
    rec.record(9, { type: EV_POINTER_UP, id: 0, x4: 600, y4: 800 });
    const decoded = decodeInputLog(JSON.parse(JSON.stringify(rec.toLog(12))));
    expect(decoded.ticks).toBe(12);
    expect(decoded.events.map((e) => e.tick)).toEqual([0, 0, 7, 9]);
    expect(decoded.events[0]!.event).toEqual({ type: EV_POINTER_DOWN, id: 0, x4: 401, y4: 800 });
  });

  it("clamps and quantizes coordinates to quarter pixels", () => {
    expect(quantize(-5, "x")).toBe(0);
    expect(quantize(10_000, "y")).toBe(2560);
    expect(quantize(12.13, "x")).toBe(49);
  });

  it("rejects malformed logs", () => {
    expect(() => decodeInputLog({ v: 2, ticks: 1, events: [] })).toThrow(/version/);
    expect(() => decodeInputLog({ v: 1, ticks: 0, events: [] })).toThrow(/ticks/);
    expect(() => decodeInputLog({ v: 1, ticks: 5, events: [0, 9, 1] })).toThrow(/out of range/);
    expect(() => decodeInputLog({ v: 1, ticks: 5, events: [0, 0, 1, 99999, 4] })).toThrow(/out of range/);
    expect(() => decodeInputLog({ v: 1, ticks: 5, events: [-1, 3, 0] })).toThrow(/out of range/);
    expect(() => decodeInputLog({ v: 1, ticks: 5, events: [0, 0, 1] })).toThrow(/out of range/);
  });

  it("never throws on garbage beyond a clean error", () => {
    const rnd = createRng("fuzz");
    for (let i = 0; i < 300; i++) {
      const events = Array.from({ length: Math.floor(rnd() * 20) }, () => Math.floor(rnd() * 3000) - 5);
      try {
        decodeInputLog({ v: 1, ticks: 10, events });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    }
  });
});

describe("input tracker", () => {
  it("derives taps, held pointers, releases, swipes and key presses", () => {
    const t = createInputTracker();
    let f = t.frame(0, [{ type: EV_POINTER_DOWN, id: 1, x4: 400, y4: 1600 }, { type: EV_KEY_DOWN, key: 4 }]);
    expect(f.taps).toEqual([{ x: 100, y: 400 }]);
    expect(f.pointer).toEqual({ x: 100, y: 400, down: true });
    expect(f.pressed.action).toBe(true);
    expect(f.keys.action).toBe(true);

    f = t.frame(1, [{ type: EV_POINTER_MOVE, id: 1, x4: 800, y4: 1600 }]);
    expect(f.taps).toEqual([]);
    expect(f.pointers).toEqual([{ id: 1, x: 200, y: 400 }]);
    expect(f.pressed.action).toBe(false);
    expect(f.keys.action).toBe(true);

    f = t.frame(10, [{ type: EV_POINTER_UP, id: 1, x4: 800, y4: 1600 }, { type: EV_KEY_UP, key: 4 }]);
    expect(f.releases).toEqual([{ x: 200, y: 400 }]);
    expect(f.swipes).toEqual(["right"]);
    expect(f.pointer.down).toBe(false);
    expect(f.keys.action).toBe(false);
  });

  it("does not count a slow drag as a swipe", () => {
    const t = createInputTracker();
    t.frame(0, [{ type: EV_POINTER_DOWN, id: 0, x4: 0, y4: 0 }]);
    const f = t.frame(100, [{ type: EV_POINTER_UP, id: 0, x4: 0, y4: 800 }]);
    expect(f.swipes).toEqual([]);
  });
});

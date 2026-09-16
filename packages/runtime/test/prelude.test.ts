import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script, no type declarations
import { BUNDLES, bundle, renderGeneratedModule } from "../scripts/build-prelude.mjs";
import { newRealm, playWithBot } from "./realm";

const root = resolve(__dirname, "..");
const example = (name: string) => readFileSync(resolve(root, "examples", name), "utf8");

describe("generated bundles", () => {
  for (const { entry, out, constant } of BUNDLES as { entry: string; out: string; constant: string }[]) {
    it(`${out} is up to date with ${entry} (run \`pnpm --filter @playloop/runtime build\` if this fails)`, () => {
      const onDisk = readFileSync(resolve(root, out), "utf8").replace(/\r\n/g, "\n");
      expect(onDisk).toBe(renderGeneratedModule(entry, constant, bundle(entry)));
    });
  }
});

describe("sandbox globals", () => {
  const run = (code: string) => {
    const ctx = newRealm(`playloop.game({ meta: { title: "t", hint: "h", maxSeconds: 5 }, init: () => ({}), update() {} });`);
    return () => vm.runInContext(code, ctx);
  };

  it("disables unseeded randomness, clocks and timers with a helpful message", () => {
    expect(run("Math.random()")).toThrow(/ctx\.random\(\)/);
    expect(run("Date.now()")).toThrow(/ctx\.time/);
    expect(run("new Date()")).toThrow(/ctx\.time/);
    expect(run("setTimeout(() => {}, 1)")).toThrow(/update\(\)/);
    expect(run("eval('1')")).toThrow(/eval/);
  });

  it("replaces transcendental Math and can't be undone by game code", () => {
    expect(run("Math.sin === Math.sin && Math.sin.toString().includes('native code')")()).toBe(false);
    expect(run("Math.sin = () => 1; Math.sin(0)")()).toBe(0);
    expect(run("Math.sqrt(16)")()).toBe(4);
  });

  it("locks the host globals", () => {
    expect(run("globalThis.__pl = null; typeof __pl.replay")()).toBe("function");
  });

  it("rejects a second playloop.game() call and invalid meta", () => {
    const once = `playloop.game({ meta: { title: "t", hint: "h", maxSeconds: 5 }, init: () => ({}), update() {} });`;
    expect(() => newRealm(once + once)).toThrow(/more than once/);
    expect(() =>
      newRealm(`playloop.game({ meta: { title: "", hint: "h", maxSeconds: 500 }, init: () => ({}), update() {} });`),
    ).toThrow(/meta\.title.*meta\.maxSeconds/);
  });
});

describe("bot plays in a V8 realm", () => {
  it("are deterministic for the same seed and inputs", () => {
    const a = playWithBot(example("desert-dash.js"), "seed-1", 42);
    const b = playWithBot(example("desert-dash.js"), "seed-1", 42);
    expect(a).toEqual(b);
  });

  it("differ with a different session seed", () => {
    const a = playWithBot(example("catch.js"), "seed-1", 7);
    const b = playWithBot(example("catch.js"), "seed-2", 7);
    expect(a.hash).not.toBe(b.hash);
  });

  it("end the way the contract says", () => {
    const c = playWithBot(example("catch.js"), "s", 1);
    expect(c.endReason).toBe("time_up");
    expect(c.ticks).toBe(25 * 60);
    const d = playWithBot(example("desert-dash.js"), "s", 1);
    expect(["lives_out", "time_up"]).toContain(d.endReason);
  });
});

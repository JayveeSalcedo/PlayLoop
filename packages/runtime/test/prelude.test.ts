import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script, no type declarations
import { BUNDLES, bundle, EXAMPLES_OUT, renderExamplesModule, renderGeneratedModule } from "../scripts/build-prelude.mjs";
import { RUNTIME_VERSION } from "../src/contract";
import { preludeFor, SUPPORTED_RUNTIME_VERSIONS } from "../src/preludes";
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

describe("generated examples", () => {
  it(`${EXAMPLES_OUT} is up to date with examples/*.js (run \`pnpm --filter @playloop/runtime build\` if this fails)`, () => {
    const onDisk = readFileSync(resolve(root, EXAMPLES_OUT), "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(renderExamplesModule());
  });
});

describe("runtime versioning", () => {
  it(`runtime version ${RUNTIME_VERSION} has a frozen prelude`, () => {
    expect(preludeFor(RUNTIME_VERSION)).toBeTypeOf("string");
  });

  /**
   * The guard. If you changed anything the simulation runs on — the prelude,
   * the RNG, deterministic Math, input decoding, tick stepping — the current
   * build stops matching the frozen prelude for this version, and this fails.
   *
   * That is the whole point: without it, the change would ship silently and
   * every play already recorded in the database would replay to a different
   * score, which verification reads as the player cheating.
   */
  it("the current build still matches the frozen prelude for this version", () => {
    const frozen = preludeFor(RUNTIME_VERSION);
    expect(
      bundle("src/prelude.ts"),
      `The runtime no longer matches frozen version ${RUNTIME_VERSION}.\n\n` +
        `Something that affects how a game is simulated has changed, so plays already\n` +
        `recorded under version ${RUNTIME_VERSION} would now replay to different scores.\n\n` +
        `If the change was deliberate:\n` +
        `  1. bump RUNTIME_VERSION in src/contract.ts\n` +
        `  2. pnpm --filter @playloop/runtime build\n` +
        `  3. node scripts/freeze-prelude.mjs\n` +
        `  4. register the new version in src/preludes.ts\n\n` +
        `If it wasn't, you've found an accidental determinism change — fix it instead.`,
    ).toBe(frozen);
  });

  it("keeps every older version replayable", () => {
    // Versions are only ever added. A missing one means plays that reference
    // it can no longer be verified at all.
    expect(SUPPORTED_RUNTIME_VERSIONS).toEqual(
      Array.from({ length: RUNTIME_VERSION }, (_, i) => i + 1),
    );
  });

  it("has no prelude for an unknown version", () => {
    expect(preludeFor(RUNTIME_VERSION + 1)).toBeNull();
    expect(preludeFor(0)).toBeNull();
  });
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

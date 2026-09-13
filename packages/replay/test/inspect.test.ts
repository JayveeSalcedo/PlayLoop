import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectGame } from "../src/verify";

const DASH = readFileSync(resolve(__dirname, "../../runtime/examples/desert-dash.js"), "utf8");

describe("inspectGame", () => {
  it("returns the meta of a valid game", async () => {
    const r = await inspectGame(DASH);
    expect(r).toMatchObject({ ok: true, meta: { title: "Desert Dash", maxSeconds: 60, lives: 3 } });
  });

  it("explains why a game can't load", async () => {
    expect(await inspectGame("playloop.game({")).toMatchObject({ ok: false, reason: "compile_error" });
    expect(await inspectGame("const x = 1;")).toMatchObject({ ok: false, reason: "contract_error" });
    expect(await inspectGame(`playloop.game({ meta: { title: "T", hint: "H", maxSeconds: 5 }, init() {} });`)).toMatchObject({
      ok: false,
      reason: "contract_error",
    });
  });

  it("stops top-level code that never finishes", async () => {
    const r = await inspectGame("for (;;) {}", { timeLimitMs: 300 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
  });
});

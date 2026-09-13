import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { playWithBot } from "../../../packages/runtime/test/realm";

const dataDir = mkdtempSync(path.join(tmpdir(), "playloop-lab-"));
process.env.LAB_DATA_DIR = dataDir;
process.env.LAB_EXAMPLES_DIR = path.resolve(__dirname, "../../../packages/runtime/examples");

// Imported after the env vars are set: lib/lab reads them at module load.
const lab = await import("../lib/lab");

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("lab server flow", () => {
  let catchGame: Awaited<ReturnType<typeof lab.getGame>>;

  beforeAll(async () => {
    catchGame = await lab.getGame("example-catch");
  });

  it("lists the example games with their meta", async () => {
    const games = await lab.listGames();
    expect(games.map((g) => g.meta?.title)).toEqual(expect.arrayContaining(["Catch and Collect", "Desert Dash"]));
  });

  it("verifies an honest play, pays the calibration preview, and refuses a second submission", async () => {
    const started = await lab.startSession("example-catch");
    if (!started.ok) throw new Error(started.detail);
    const play = playWithBot(catchGame!.code, started.seed, 11);
    lab.backdateSessionForTests(started.sessionId, play.ticks / 60 + 3);

    const first = await lab.submitSession(started.sessionId, { score: play.score, log: play.log });
    expect(first).toMatchObject({ ok: true, verdict: { ok: true, score: play.score, ticks: play.ticks, payoutPreview: lab.CALIBRATION_PAYOUT } });

    const again = await lab.submitSession(started.sessionId, { score: play.score, log: play.log });
    expect(again).toMatchObject({ ok: false, status: 409 });

    const plays = await lab.recentPlays();
    expect(plays[0]).toMatchObject({ sessionId: started.sessionId, claimedScore: play.score, verdict: { ok: true } });
  }, 30_000);

  it("rejects a log that claims more game time than real time allows", async () => {
    const started = await lab.startSession("example-catch");
    if (!started.ok) throw new Error(started.detail);
    const play = playWithBot(catchGame!.code, started.seed, 12);
    const result = await lab.submitSession(started.sessionId, { score: play.score, log: play.log });
    expect(result).toMatchObject({ ok: true, verdict: { ok: false, reason: "too_fast" } });
  });

  it("catches every tamper test", async () => {
    const started = await lab.startSession("example-catch");
    if (!started.ok) throw new Error(started.detail);
    const play = playWithBot(catchGame!.code, started.seed, 13);
    expect(play.score).toBeGreaterThan(0);
    lab.backdateSessionForTests(started.sessionId, play.ticks / 60 + 3);
    await lab.submitSession(started.sessionId, { score: play.score, log: play.log });

    for (const { kind } of lab.TAMPER_KINDS) {
      const result = await lab.tamperSession(started.sessionId, kind);
      if (!result.ok) throw new Error(result.detail);
      expect(result.verdict.ok, kind).toBe(false);
    }
  }, 60_000);

  it("rejects bad submissions without replaying", async () => {
    expect(await lab.submitSession("nope", { score: 1, log: {} })).toMatchObject({ ok: false, status: 404 });
    const started = await lab.startSession("example-catch");
    if (!started.ok) throw new Error(started.detail);
    expect(await lab.submitSession(started.sessionId, { score: -3, log: {} })).toMatchObject({ ok: false, status: 400 });
    expect(await lab.startSession("example-does-not-exist")).toMatchObject({ ok: false });
  });

  it("adds a pasted game only if it loads in the sandbox", async () => {
    const bad = await lab.addGame("playloop.game({ meta: { title: 'X' } });");
    expect(bad).toMatchObject({ ok: false });
    const good = await lab.addGame(`playloop.game({ meta: { title: "Pasted", hint: "A pasted game", maxSeconds: 5 }, init: () => ({}), update() {} });`);
    if (!good.ok) throw new Error(good.detail);
    expect((await lab.getGame(good.id))?.meta?.title).toBe("Pasted");
  });
});

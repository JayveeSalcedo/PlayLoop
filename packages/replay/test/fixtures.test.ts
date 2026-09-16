/**
 * Frozen recorded plays: real bot plays captured once (by
 * scripts/make-fixture.mjs) with the score, tick count, end reason and state
 * hash they produced.
 *
 * verify.test.ts already proves a play recorded in V8 replays identically in
 * QuickJS *today*. This proves something different and complementary: that the
 * same play still replays to the same number *tomorrow*. Any change to the
 * prelude, deterministic Math, the RNG, the input encoding or tick stepping
 * that would silently re-score every stored play in the database breaks these
 * first — which is the signal to bump RUNTIME_VERSION rather than ship it.
 *
 * So a failure here is never "fix the fixture". It's either an unintended
 * determinism regression, or a deliberate runtime change that needs a version
 * bump and a regenerated fixture alongside it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyPlay } from "../src/verify";

interface Fixture {
  game: string;
  bot: string;
  seed: string;
  runtimeVersion: number;
  code: string;
  log: { v: 1; ticks: number; events: number[] };
  expectedScore: number;
  expectedTicks: number;
  expectedEndReason: string;
  expectedHash: string;
}

const dir = resolve(__dirname, "fixtures");
const names = readdirSync(dir).filter((f) => f.endsWith("-play.json"));

describe("frozen recorded plays", () => {
  it("has fixtures to check", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    const fixture = JSON.parse(readFileSync(resolve(dir, name), "utf8")) as Fixture;

    it(`${fixture.game}: ${fixture.bot} on ${fixture.seed} still scores ${fixture.expectedScore}`, async () => {
      const result = await verifyPlay({
        code: fixture.code,
        seed: fixture.seed,
        log: JSON.stringify(fixture.log),
        claimedScore: fixture.expectedScore,
        runtimeVersion: fixture.runtimeVersion,
      });

      expect(result.ok ? null : `${result.reason}: ${result.detail}`).toBeNull();
      if (!result.ok) return;

      expect(result.score).toBe(fixture.expectedScore);
      expect(result.ticks).toBe(fixture.expectedTicks);
      expect(result.endReason).toBe(fixture.expectedEndReason);
      // The state hash catches a divergence that happens to land on the same
      // score — the score alone is a lossy view of the simulation.
      expect(result.hash).toBe(fixture.expectedHash);
    });
  }

  it("pays the replay's score, not the claim", async () => {
    const fixture = JSON.parse(readFileSync(resolve(dir, names[0]!), "utf8")) as Fixture;

    const result = await verifyPlay({
      code: fixture.code,
      seed: fixture.seed,
      log: JSON.stringify(fixture.log),
      claimedScore: fixture.expectedScore + 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("score_mismatch");
    expect(result.replayScore).toBe(fixture.expectedScore);
  });

  it("refuses to replay under a runtime version this build doesn't have", async () => {
    const fixture = JSON.parse(readFileSync(resolve(dir, names[0]!), "utf8")) as Fixture;

    const result = await verifyPlay({
      code: fixture.code,
      seed: fixture.seed,
      log: JSON.stringify(fixture.log),
      claimedScore: fixture.expectedScore,
      runtimeVersion: 9999,
    });

    // Refusing is the point. Silently replaying under the current runtime is
    // what would re-score old plays and reject honest players.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("runtime_mismatch");
  });

  it("rejects a play replayed under a different seed", async () => {
    const fixture = JSON.parse(readFileSync(resolve(dir, names[0]!), "utf8")) as Fixture;

    const result = await verifyPlay({
      code: fixture.code,
      seed: "not-the-seed-this-was-played-on",
      log: JSON.stringify(fixture.log),
      claimedScore: fixture.expectedScore,
    });

    expect(result.ok).toBe(false);
  });
});

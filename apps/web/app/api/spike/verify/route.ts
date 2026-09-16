/**
 * Deployment spike: proves QuickJS replay verification actually runs in the
 * deployed serverless environment before any of the game-version work depends
 * on it.
 *
 * It replays a committed fixture — a real recorded bot play of a known game —
 * exactly the way submitPlay will, and reports whether the score came back
 * right and how long it took. What we're checking is not the score (that's
 * verified offline already) but that:
 *
 *   - @playloop/replay loaded as a Node module instead of being bundled,
 *   - the worker script beside it survived output-file tracing,
 *   - QuickJS's WebAssembly compiled inside the function,
 *   - and the whole thing fits well inside the request budget, cold and warm.
 *
 * Temporary. Delete once Phase 4's real verify route exists and is proven.
 */
import { verifyPlay } from "@playloop/replay";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FIXTURES = ["catch-play", "brand-pop-play", "desert-dash-play"] as const;

/** Set once per warm instance, so the response says whether this was a cold start. */
let servedBefore = false;

interface Fixture {
  game: string;
  seed: string;
  code: string;
  log: { v: 1; ticks: number; events: number[] };
  expectedScore: number;
  expectedTicks: number;
  expectedEndReason: string;
  expectedHash: string;
}

async function loadFixture(name: string): Promise<Fixture> {
  const file = path.join(process.cwd(), "..", "..", "packages", "replay", "test", "fixtures", `${name}.json`);
  return JSON.parse(await readFile(file, "utf8")) as Fixture;
}

export async function GET(request: Request) {
  const cold = !servedBefore;
  servedBefore = true;

  const asked = new URL(request.url).searchParams.get("fixture");
  const names = asked ? [asked] : [...FIXTURES];
  const isolate = process.env.PLAY_VERIFY_ISOLATE === "inline" ? "inline" : "worker";

  const started = Date.now();
  const results = [];

  for (const name of names) {
    try {
      const fixture = await loadFixture(name);
      const at = Date.now();
      const result = await verifyPlay({
        code: fixture.code,
        seed: fixture.seed,
        log: JSON.stringify(fixture.log),
        claimedScore: fixture.expectedScore,
        isolate,
      });
      results.push({
        fixture: name,
        game: fixture.game,
        ok: result.ok,
        matchedExpectedScore: result.ok && result.score === fixture.expectedScore,
        expectedScore: fixture.expectedScore,
        score: result.ok ? result.score : null,
        ticks: result.ok ? result.ticks : null,
        reason: result.ok ? null : result.reason,
        detail: result.ok ? null : result.detail,
        replayMs: result.ok ? result.replayMs : null,
        totalMs: Date.now() - at,
      });
    } catch (e) {
      // A throw here (rather than an {ok:false}) is the signal that the
      // platform, not the game, is the problem — a missing worker file or a
      // WASM that wouldn't compile.
      results.push({
        fixture: name,
        platformError: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        stack: e instanceof Error ? e.stack?.split("\n").slice(0, 6).join("\n") : undefined,
      });
    }
  }

  const passed = results.every((r) => "matchedExpectedScore" in r && r.matchedExpectedScore);

  return NextResponse.json(
    {
      verdict: passed ? "QuickJS replay works here" : "QuickJS replay is NOT working here",
      coldStart: cold,
      isolate,
      node: process.version,
      totalMs: Date.now() - started,
      results,
    },
    { status: passed ? 200 : 500 },
  );
}

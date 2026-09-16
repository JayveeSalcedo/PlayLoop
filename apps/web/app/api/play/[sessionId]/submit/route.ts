/**
 * Submits a finished code-game play: the client's claimed score and its
 * recorded inputs. The claim is never paid. The server replays the exact inputs
 * against the exact game version and runtime the session was pinned to, with
 * the seed the server chose, and pays the score *that* produces.
 *
 *     game_versions.code + game_versions.runtime_version
 *   + play_sessions.seed + play_input_logs.log   →   verified score
 *
 * Nothing the client sends decides the seed, the code, the runtime or the
 * score that's paid; it only supplies the claim and the inputs.
 *
 * Three steps, deliberately not one transaction:
 *
 *  1. Claim. A single conditional UPDATE stamps verifying_at on a session that
 *     is still 'started', unclaimed and this player's, so a duplicate submit
 *     finds nothing. Elapsed time is computed in that same query, DB-side —
 *     never against the app server's clock, which has broken this before.
 *  2. Verify. Cheap checks first (score shape, log size, a log claiming more
 *     play than real time allows), then the QuickJS replay. This runs outside
 *     any transaction: a replay can take a second or two, and holding a
 *     Postgres transaction open across it — at a ~90 ms round trip to Seoul,
 *     against Supabase's connection limits — isn't acceptable.
 *  3. Record. One transaction keeps the input log whatever the verdict, marks
 *     the session completed or rejected, and on success credits it through
 *     creditVerifiedPlay, the same code template games are paid through.
 *
 * A studio test play (play_sessions.is_test) goes through all three steps the
 * same way — its verified result is what lets a creator submit that version —
 * but is never credited, and gets the replay's reason back when it fails, since
 * the creator is debugging their own game rather than being checked for cheating.
 *
 * If the function dies between 1 and 3, the session is left 'started' with
 * verifying_at set: nothing is paid, and it can't be submitted again. That's
 * the safe direction to fail in.
 *
 * A route handler rather than a server action because maxDuration is
 * route-segment config; an action inherits the duration of whatever page
 * invoked it.
 */
import { getDb, schema } from "@playloop/db";
import { verifyPlay, type VerifyResult } from "@playloop/replay";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { precheckSubmission, rejectionMessage } from "@/lib/codePlay";
import { creditVerifiedPlay } from "@/lib/creditPlay";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Per-replay time limit. The game lab refuses to pass a version whose
 * full-length replay is estimated over this budget, so an honest play of a
 * published version fits comfortably inside it.
 */
const REPLAY_TIME_LIMIT_MS = 2_000;

/**
 * "inline" is the fallback if worker threads misbehave in a deployment: the same
 * QuickJS sandbox and memory cap, losing only the hard external kill. Flippable
 * without a deploy. Never weaken the sandbox itself instead.
 */
const isolate = process.env.PLAY_VERIFY_ISOLATE === "inline" ? "inline" : "worker";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to play for points." }, { status: 401 });
  const { sessionId } = await params;

  let body: { score?: unknown; log?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That submission wasn't valid JSON." }, { status: 400 });
  }

  const db = getDb();

  // ---- 1. claim ----
  const [claimed] = await db
    .update(schema.playSessions)
    .set({ verifyingAt: sql`now()` })
    .where(
      and(
        eq(schema.playSessions.id, sessionId),
        eq(schema.playSessions.profileId, session.sub),
        eq(schema.playSessions.status, "started"),
        isNull(schema.playSessions.verifyingAt),
        // Only code-game sessions are verified here; template plays go through
        // submitPlay's analytic rules.
        isNotNull(schema.playSessions.gameVersionId),
      ),
    )
    .returning({
      gameId: schema.playSessions.gameId,
      gameVersionId: schema.playSessions.gameVersionId,
      seed: schema.playSessions.seed,
      challengeId: schema.playSessions.challengeId,
      isTest: schema.playSessions.isTest,
      elapsedSeconds: sql<number>`extract(epoch from (now() - ${schema.playSessions.startedAt}))`.mapWith(Number),
    });
  if (!claimed?.gameVersionId || !claimed.seed) {
    return NextResponse.json({ error: "This play session was already used or doesn't exist." }, { status: 409 });
  }

  // The pinned version, not the game's current one: publishing a new version
  // mid-play must not change what this session is scored against.
  const [row] = await db
    .select({
      game: { id: schema.games.id, title: schema.games.title, maxPoints: schema.games.maxPoints },
      code: schema.gameVersions.code,
      runtimeVersion: schema.gameVersions.runtimeVersion,
      scoreTarget: schema.gameVersions.scoreTarget,
    })
    .from(schema.gameVersions)
    .innerJoin(schema.games, eq(schema.gameVersions.gameId, schema.games.id))
    .where(eq(schema.gameVersions.id, claimed.gameVersionId));
  if (!row) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  // ---- 2. verify ----
  const pre = precheckSubmission(body, claimed.elapsedSeconds);

  let verdict: VerifyResult | { ok: false; reason: string; detail: string; elapsedMs: number; replayScore?: number };
  if (!pre.ok) {
    verdict = { ok: false, reason: pre.reason, detail: pre.detail, elapsedMs: 0 };
  } else {
    try {
      verdict = await verifyPlay({
        code: row.code,
        seed: claimed.seed,
        log: pre.logJson,
        claimedScore: pre.score,
        runtimeVersion: row.runtimeVersion,
        timeLimitMs: REPLAY_TIME_LIMIT_MS,
        isolate,
      });
    } catch (e) {
      // A throw (rather than {ok:false}) means the platform failed — a missing
      // worker file, a WASM that wouldn't load — not that the play was wrong.
      console.error("verifyPlay threw", e);
      verdict = { ok: false, reason: "verifier_error", detail: e instanceof Error ? e.message : String(e), elapsedMs: 0 };
    }
  }

  // ---- 3. record ----
  const outcome = await db.transaction(async (tx) => {
    const logJson = pre.logJson;
    if (logJson !== null) {
      // Kept whatever the verdict: a rejected play is exactly the one a fraud
      // reviewer needs to be able to re-run.
      await tx.insert(schema.playInputLogs).values({
        playSessionId: sessionId,
        log: logJson,
        logBytes: pre.logBytes,
        claimedScore: pre.score,
      });
    }

    const [marked] = await tx
      .update(schema.playSessions)
      .set({
        status: verdict.ok ? "completed" : "rejected",
        completedAt: sql`now()`,
        // The claim, kept either way so a mismatch stays legible.
        score: pre.score,
        verifiedScore: verdict.ok ? verdict.score : (verdict.replayScore ?? null),
        verifyReason: verdict.ok ? null : verdict.reason,
        verifyMs: verdict.elapsedMs,
        replayTicks: verdict.ok ? verdict.ticks : null,
        replayEndReason: verdict.ok ? verdict.endReason : null,
      })
      // Still 'started': if the player's session was abandoned in the meantime,
      // nothing gets marked or paid.
      .where(and(eq(schema.playSessions.id, sessionId), eq(schema.playSessions.status, "started")))
      .returning({ id: schema.playSessions.id });
    if (!marked) return { ok: false as const, error: "This play session was already used or doesn't exist.", status: 409 };

    if (!verdict.ok) {
      return {
        ok: false as const,
        error: claimed.isTest ? `That test play didn't verify: ${verdict.detail}` : rejectionMessage(verdict.reason),
        reason: claimed.isTest ? verdict.reason : undefined,
        status: 422,
      };
    }

    if (claimed.isTest) {
      // Verified, recorded, and deliberately not paid.
      return { ok: true as const, test: true as const, score: verdict.score, ticks: verdict.ticks, endReason: verdict.endReason };
    }

    const credited = await creditVerifiedPlay(tx, {
      sessionId,
      profileId: session.sub,
      game: row.game,
      // The replay's score. Never the client's claim.
      score: verdict.score,
      target: row.scoreTarget ?? 0,
      challengeId: claimed.challengeId,
    });
    return credited.ok ? credited : { ...credited, status: 403 };
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.error, reason: "reason" in outcome ? outcome.reason : undefined }, { status: outcome.status });
  const { ok: _ok, ...result } = outcome;
  return NextResponse.json(result);
}

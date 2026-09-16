/**
 * The parts of verifying a code-game play that don't need a database or a
 * sandbox: the cheap checks that run before we spend a QuickJS replay, and what
 * to tell the player when a play isn't accepted.
 *
 * Pure, so it's unit-tested here; the route that uses it is
 * app/api/play/[sessionId]/submit/route.ts.
 */
import { MAX_GAME_SECONDS, TICKS_PER_SECOND } from "@playloop/runtime";

/** Same limit @playloop/replay enforces; checked here too so an oversized log never reaches the sandbox. */
export const MAX_LOG_BYTES = 200_000;

/**
 * Game time can't run ahead of real time — the browser host steps at most 60
 * ticks per wall-clock second — so a log claiming more play than has elapsed
 * since startPlay was fabricated. This slack covers the network round trip and
 * timer granularity, not a meaningful amount of play.
 */
export const REAL_TIME_TOLERANCE_SECONDS = 0.5;

/**
 * How long after startPlay a submission is still accepted, beyond the longest
 * possible game. Same idea as the template engine's stale window: a
 * backgrounded tab or a slow network shouldn't lose a play, but a session
 * shouldn't stay submittable forever either.
 */
export const STALE_SLACK_SECONDS = 10 * 60;

export type PrecheckRejection = "invalid_score" | "bad_log" | "too_large" | "too_fast" | "expired";

export type Precheck =
  | { ok: true; score: number; logJson: string; logBytes: number; ticks: number }
  | { ok: false; reason: PrecheckRejection; detail: string; score: number | null; logJson: string | null; logBytes: number };

/**
 * `elapsedSeconds` must come from the database's clock (now() - started_at),
 * never the app server's — clock skew between the two has broken play
 * verification before.
 */
export function precheckSubmission(body: { score?: unknown; log?: unknown }, elapsedSeconds: number): Precheck {
  const score = typeof body.score === "number" && Number.isInteger(body.score) && body.score >= 0 ? body.score : null;

  let logJson: string | null = null;
  try {
    logJson = typeof body.log === "string" ? body.log : body.log == null ? null : JSON.stringify(body.log);
  } catch {
    logJson = null;
  }
  const logBytes = logJson === null ? 0 : new TextEncoder().encode(logJson).length;

  if (score === null) {
    return { ok: false, reason: "invalid_score", detail: "The score wasn't a whole, non-negative number.", score, logJson, logBytes };
  }
  if (logJson === null) {
    return { ok: false, reason: "bad_log", detail: "No input log was sent.", score, logJson, logBytes };
  }
  if (logBytes > MAX_LOG_BYTES) {
    // Don't keep it: an oversized log is exactly what we refuse to store.
    return { ok: false, reason: "too_large", detail: `The input log is over ${MAX_LOG_BYTES / 1000} KB.`, score, logJson: null, logBytes };
  }

  let ticks: unknown;
  try {
    ticks = (JSON.parse(logJson) as { ticks?: unknown } | null)?.ticks;
  } catch {
    return { ok: false, reason: "bad_log", detail: "The input log isn't valid JSON.", score, logJson, logBytes };
  }
  if (typeof ticks !== "number" || !Number.isInteger(ticks) || ticks < 1) {
    return { ok: false, reason: "bad_log", detail: "The input log has no tick count.", score, logJson, logBytes };
  }

  if (elapsedSeconds + REAL_TIME_TOLERANCE_SECONDS < ticks / TICKS_PER_SECOND) {
    return {
      ok: false,
      reason: "too_fast",
      detail: `The log covers ${(ticks / TICKS_PER_SECOND).toFixed(1)} s of play, but only ${elapsedSeconds.toFixed(1)} s passed since the session started.`,
      score,
      logJson,
      logBytes,
    };
  }
  if (elapsedSeconds > MAX_GAME_SECONDS + STALE_SLACK_SECONDS) {
    return { ok: false, reason: "expired", detail: "Submitted long after the session was issued.", score, logJson, logBytes };
  }

  return { ok: true, score, logJson, logBytes, ticks };
}

/**
 * Reasons that say our side couldn't finish checking, rather than that the play
 * was wrong. The player hears "try again", and a reviewer shouldn't read these
 * as a fraud signal.
 */
const NOT_THE_PLAYERS_FAULT = new Set(["timeout", "out_of_memory", "runtime_mismatch", "verifier_error"]);

export function isVerifierProblem(reason: string): boolean {
  return NOT_THE_PLAYERS_FAULT.has(reason);
}

/** What the player sees when a play earns nothing. Deliberately vague about *why* on a suspected forgery. */
export function rejectionMessage(reason: string): string {
  if (reason === "expired") return "That play took too long to send, so it couldn't be counted. Please play again.";
  if (isVerifierProblem(reason)) {
    return "We couldn't finish checking that play, so no points were awarded. Nothing was charged — please try again.";
  }
  return "That play couldn't be verified, so no points were awarded. Please try again.";
}

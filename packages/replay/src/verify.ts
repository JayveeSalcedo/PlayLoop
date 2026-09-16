/**
 * Server-side score verification. Runs untrusted game code in QuickJS
 * (WebAssembly: no Node APIs, no filesystem, no network) with a memory cap,
 * replays the recorded inputs through the shared prelude, and returns the
 * score the game actually produced.
 *
 * Two layers bound the cost of a hostile game:
 *  1. QuickJS's memory limit and deadline interrupt (cheap, catches most loops)
 *  2. a worker thread killed from outside at the deadline (the hard guarantee,
 *     needed because the interrupt never fires inside long native operations)
 *
 * Only `verifyPlay`'s score should ever be paid. The client's claimed score is
 * compared against it purely to flag tampering or engine divergence.
 */
import type { GameMeta, ReplayResult } from "@playloop/runtime";
import { byteLength, MAX_CODE_BYTES, runSandboxed, type SandboxFailureReason } from "./sandbox";

export { MAX_CODE_BYTES } from "./sandbox";
export const MAX_LOG_BYTES = 200_000;

export type VerifyFailureReason =
  | "too_large"
  | SandboxFailureReason
  | "bad_log"
  | "tick_mismatch"
  | "events_after_end"
  | "too_many_ticks"
  | "score_mismatch";

export type VerifyResult =
  | { ok: true; score: number; ticks: number; endReason: string; hash: string; elapsedMs: number; replayMs: number }
  | { ok: false; reason: VerifyFailureReason; detail: string; tick?: number; replayScore?: number; elapsedMs: number };

export interface VerifyInput {
  /** The exact game version's source the session was started on. */
  code: string;
  /** The seed the server issued at startPlay. */
  seed: string;
  /** The InputLog as submitted (JSON string or parsed object). */
  log: string | object;
  /** The score the client says it reached. Omit to just replay (the game lab does). */
  claimedScore?: number;
  timeLimitMs?: number;
  memoryLimitBytes?: number;
  /**
   * "worker" (default): hard-killable thread, use for anything a player submits.
   * "inline": same QuickJS sandbox on the calling thread, no hard kill — only
   * for trusted code paths such as tests of known-good games.
   */
  isolate?: "worker" | "inline";
  /**
   * The runtime version the game version was created under — pass it for any
   * real play. A recorded play is only reproducible under the simulation that
   * produced it, so verifying a stored play against the current runtime is a
   * bug: after any determinism change it would re-score honest plays and read
   * the difference as tampering. Omitted means "the current runtime", which is
   * right only for a game being checked as it's created.
   */
  runtimeVersion?: number;
}

export async function verifyPlay(input: VerifyInput): Promise<VerifyResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  const logJson = typeof input.log === "string" ? input.log : JSON.stringify(input.log);
  if (byteLength(input.code) > MAX_CODE_BYTES) {
    return { ok: false, reason: "too_large", detail: `Game code is over ${MAX_CODE_BYTES / 1000} KB.`, elapsedMs: elapsed() };
  }
  if (byteLength(logJson) > MAX_LOG_BYTES) {
    return { ok: false, reason: "too_large", detail: `Input log is over ${MAX_LOG_BYTES / 1000} KB.`, elapsedMs: elapsed() };
  }

  const run = await runSandboxed({
    code: input.code,
    expression: `__pl.replay(${JSON.stringify(input.seed)}, ${JSON.stringify(logJson)})`,
    timeLimitMs: input.timeLimitMs,
    memoryLimitBytes: input.memoryLimitBytes,
    isolate: input.isolate,
    runtimeVersion: input.runtimeVersion,
  });
  if (!run.ok) return { ok: false, reason: run.reason, detail: run.detail, elapsedMs: elapsed() };

  const result = JSON.parse(String(run.value)) as ReplayResult;
  if (!result.ok) {
    // QuickJS's out-of-memory error is catchable, so the replay loop reports it as a game exception.
    const reason = result.reason === "runtime_error" && /out of memory/i.test(result.detail) ? "out_of_memory" : result.reason;
    return { ok: false, reason, detail: result.detail, tick: result.tick, elapsedMs: elapsed() };
  }
  if (input.claimedScore !== undefined && input.claimedScore !== result.score) {
    return {
      ok: false,
      reason: "score_mismatch",
      detail: `Claimed ${input.claimedScore}, replay produced ${result.score}.`,
      replayScore: result.score,
      elapsedMs: elapsed(),
    };
  }
  return {
    ok: true,
    score: result.score,
    ticks: result.ticks,
    endReason: result.endReason,
    hash: result.hash,
    elapsedMs: elapsed(),
    replayMs: run.evalMs,
  };
}

export type InspectResult =
  | { ok: true; meta: GameMeta; elapsedMs: number }
  | { ok: false; reason: "too_large" | SandboxFailureReason; detail: string; elapsedMs: number };

/**
 * Loads a game in the sandbox without playing it and returns its meta, or why
 * it can't load. Top-level game code runs here, so it gets the same limits
 * and the same killable worker as a replay.
 */
export async function inspectGame(code: string, options: { timeLimitMs?: number } = {}): Promise<InspectResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  if (byteLength(code) > MAX_CODE_BYTES) {
    return { ok: false, reason: "too_large", detail: `Game code is over ${MAX_CODE_BYTES / 1000} KB.`, elapsedMs: elapsed() };
  }
  const run = await runSandboxed({ code, expression: "__pl.meta()", timeLimitMs: options.timeLimitMs });
  if (!run.ok) return { ok: false, reason: run.reason, detail: run.detail, elapsedMs: elapsed() };
  const result = JSON.parse(String(run.value)) as { ok: true; meta: GameMeta } | { ok: false; detail: string };
  if (!result.ok) return { ok: false, reason: "contract_error", detail: result.detail, elapsedMs: elapsed() };
  return { ok: true, meta: result.meta, elapsedMs: elapsed() };
}

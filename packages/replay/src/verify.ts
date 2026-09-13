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
import { PRELUDE_SOURCE, type ReplayResult } from "@playloop/runtime";
import { Worker } from "node:worker_threads";
import { runJob, type JobOutcome, type ReplayJob } from "./sandbox-worker.mjs";

export const MAX_CODE_BYTES = 60_000;
export const MAX_LOG_BYTES = 200_000;
const DEFAULT_TIME_LIMIT_MS = 2_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
/** Worker boot + WebAssembly compile, allowed on top of the game's own time limit. */
const WORKER_STARTUP_GRACE_MS = 1_500;

export type VerifyFailureReason =
  | "too_large"
  | "compile_error"
  | "contract_error"
  | "runtime_error"
  | "timeout"
  | "out_of_memory"
  | "bad_log"
  | "tick_mismatch"
  | "events_after_end"
  | "too_many_ticks"
  | "score_mismatch";

export type VerifyResult =
  | { ok: true; score: number; ticks: number; endReason: string; hash: string; elapsedMs: number }
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

  const job: ReplayJob = {
    prelude: PRELUDE_SOURCE,
    code: input.code,
    seed: input.seed,
    logJson,
    timeLimitMs: input.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    memoryLimitBytes: input.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
  };

  const outcome = input.isolate === "inline" ? await runJob(job) : await runInWorker(job);
  if (outcome === "killed") {
    return { ok: false, reason: "timeout", detail: `The game didn't finish replaying within ${job.timeLimitMs} ms.`, elapsedMs: elapsed() };
  }

  if (!outcome.ok) {
    if (outcome.stage === "prelude") {
      // The prelude is our own code; failing here is a platform bug, not the game's fault.
      throw new Error(`PlayLoop prelude failed to load: ${outcome.message}`);
    }
    return { ok: false, reason: classify(outcome), detail: outcome.message, elapsedMs: elapsed() };
  }

  const result = JSON.parse(String(outcome.value)) as ReplayResult;
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
  return { ok: true, score: result.score, ticks: result.ticks, endReason: result.endReason, hash: result.hash, elapsedMs: elapsed() };
}

function runInWorker(job: ReplayJob): Promise<JobOutcome | "killed"> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sandbox-worker.mjs", import.meta.url));
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => resolve("killed"));
      void worker.terminate();
    }, job.timeLimitMs + WORKER_STARTUP_GRACE_MS);

    worker.once("message", (msg: { ok: true; outcome: JobOutcome } | { ok: false; message: string }) => {
      settle(() => (msg.ok ? resolve(msg.outcome) : reject(new Error(`Replay worker failed: ${msg.message}`))));
      void worker.terminate();
    });
    worker.once("error", (err) => settle(() => reject(err)));
    worker.once("exit", (code) => settle(() => reject(new Error(`Replay worker exited early (code ${code}).`))));
    worker.postMessage(job);
  });
}

/** Maps a QuickJS exception to a failure reason. */
function classify(outcome: Extract<JobOutcome, { ok: false }>): VerifyFailureReason {
  if (outcome.name === "InternalError" && /interrupted/i.test(outcome.message)) return "timeout";
  if (/out of memory/i.test(outcome.message)) return "out_of_memory";
  if (outcome.name === "SyntaxError") return "compile_error";
  if (outcome.stage === "game") {
    // Thrown while the game file was evaluated: a bad playloop.game({...}) call is a contract problem.
    return /playloop\.game|meta\.|init\(|update\(|render\(/.test(outcome.message) ? "contract_error" : "runtime_error";
  }
  return "runtime_error";
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

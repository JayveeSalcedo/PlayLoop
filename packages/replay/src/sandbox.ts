/**
 * Runs a job in QuickJS, by default inside a worker thread that is killed at
 * the deadline, and classifies failures. Shared by verifyPlay, inspectGame
 * and the game lab.
 */
import { currentPrelude, preludeFor, RUNTIME_VERSION } from "@playloop/runtime";
import { Worker } from "node:worker_threads";
import { runJob, type JobOutcome, type SandboxJob } from "./sandbox-worker.mjs";

export const MAX_CODE_BYTES = 60_000;
export const DEFAULT_TIME_LIMIT_MS = 2_000;
export const DEFAULT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
/**
 * How long the worker gets to boot and compile QuickJS's WebAssembly before it
 * has even started the job. Generous on purpose: on a cold serverless instance
 * this is hundreds of milliseconds, sometimes more, and being stingy here would
 * report a slow *engine start* as a slow *game* — rejecting an honest player's
 * play as a timeout, which is the same class of bug as trusting a skewed clock.
 *
 * It costs nothing in containment because it only applies before the game runs:
 * the worker pings when it's ready, and from then on the deadline below is what
 * bounds hostile code.
 */
export const WORKER_STARTUP_BUDGET_MS = 10_000;

/**
 * Slack on top of the job's own time limit once the game is actually running —
 * just enough to cover posting the result back. This, not the start-up budget,
 * is the hard wall-clock guarantee.
 */
export const WORKER_KILL_SLACK_MS = 500;

export type SandboxFailureReason =
  | "compile_error"
  | "contract_error"
  | "runtime_error"
  | "timeout"
  | "out_of_memory"
  /** This build has no prelude for the runtime version the play was recorded under. */
  | "runtime_mismatch";

export type SandboxResult =
  | { ok: true; value: unknown; evalMs: number }
  | { ok: false; reason: SandboxFailureReason; stage: "game" | "run"; detail: string };

export interface SandboxOptions {
  code: string;
  expression: string;
  hostScripts?: string[];
  timeLimitMs?: number;
  memoryLimitBytes?: number;
  isolate?: "worker" | "inline";
  /**
   * Which runtime to simulate under. Omit for the current one — correct when
   * checking a game being created, wrong when replaying a recorded play, which
   * must use the version its game was made under.
   */
  runtimeVersion?: number;
}

export async function runSandboxed(options: SandboxOptions): Promise<SandboxResult> {
  const prelude = options.runtimeVersion === undefined ? currentPrelude() : preludeFor(options.runtimeVersion);
  if (prelude === null) {
    // Refusing is the only safe answer: replaying under a different runtime
    // could score the play differently, and we'd read that as the player
    // cheating.
    return {
      ok: false,
      reason: "runtime_mismatch",
      stage: "run",
      detail: `This build can't replay runtime version ${options.runtimeVersion}; it has ${RUNTIME_VERSION}.`,
    };
  }

  const job: SandboxJob = {
    prelude,
    code: options.code,
    hostScripts: options.hostScripts,
    expression: options.expression,
    timeLimitMs: options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    memoryLimitBytes: options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
  };
  const outcome = options.isolate === "inline" ? await runJob(job) : await runInWorker(job);
  if (outcome === "killed") {
    return { ok: false, reason: "timeout", stage: "run", detail: `Didn't finish within ${job.timeLimitMs} ms.` };
  }
  if (outcome.ok) return { ok: true, value: outcome.value, evalMs: outcome.evalMs };
  if (outcome.stage === "prelude") {
    // The prelude and host scripts are our own code; failing there is a platform bug, not the game's fault.
    throw new Error(`PlayLoop sandbox script failed: ${outcome.message}`);
  }
  return { ok: false, reason: classify(outcome), stage: outcome.stage, detail: outcome.message };
}

type WorkerMessage = { ready: true } | { ok: true; outcome: JobOutcome } | { ok: false; message: string };

function runInWorker(job: SandboxJob): Promise<JobOutcome | "killed"> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sandbox-worker.mjs", import.meta.url));
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const kill = () => {
      settle(() => resolve("killed"));
      void worker.terminate();
    };
    const armFor = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(kill, ms);
    };

    // Until the worker says it's ready, we're timing the engine's start-up.
    armFor(WORKER_STARTUP_BUDGET_MS);

    worker.on("message", (msg: WorkerMessage) => {
      if ("ready" in msg) {
        // QuickJS is up and the game is about to run: from here the job's own
        // time limit is what applies, so hostile code gets no benefit from the
        // start-up budget.
        armFor(job.timeLimitMs + WORKER_KILL_SLACK_MS);
        return;
      }
      settle(() => (msg.ok ? resolve(msg.outcome) : reject(new Error(`Sandbox worker failed: ${msg.message}`))));
      void worker.terminate();
    });
    worker.once("error", (err) => settle(() => reject(err)));
    worker.once("exit", (code) => settle(() => reject(new Error(`Sandbox worker exited early (code ${code}).`))));
    worker.postMessage(job);
  });
}

function classify(outcome: Extract<JobOutcome, { ok: false }>): SandboxFailureReason {
  if (outcome.name === "InternalError" && /interrupted/i.test(outcome.message)) return "timeout";
  if (/out of memory/i.test(outcome.message)) return "out_of_memory";
  if (outcome.name === "SyntaxError") return "compile_error";
  if (outcome.stage === "game") {
    // Thrown while the game file was evaluated: a bad playloop.game({...}) call is a contract problem.
    return /playloop\.game|meta\.|init\(|update\(|render\(/.test(outcome.message) ? "contract_error" : "runtime_error";
  }
  return "runtime_error";
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

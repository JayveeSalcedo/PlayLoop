/**
 * Runs a job in QuickJS, by default inside a worker thread that is killed at
 * the deadline, and classifies failures. Shared by verifyPlay, inspectGame
 * and the game lab.
 */
import { PRELUDE_SOURCE } from "@playloop/runtime";
import { Worker } from "node:worker_threads";
import { runJob, type JobOutcome, type SandboxJob } from "./sandbox-worker.mjs";

export const MAX_CODE_BYTES = 60_000;
export const DEFAULT_TIME_LIMIT_MS = 2_000;
export const DEFAULT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
/** Worker boot + WebAssembly compile, allowed on top of the job's own time limit. */
const WORKER_STARTUP_GRACE_MS = 1_500;

export type SandboxFailureReason = "compile_error" | "contract_error" | "runtime_error" | "timeout" | "out_of_memory";

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
}

export async function runSandboxed(options: SandboxOptions): Promise<SandboxResult> {
  const job: SandboxJob = {
    prelude: PRELUDE_SOURCE,
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

function runInWorker(job: SandboxJob): Promise<JobOutcome | "killed"> {
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

// Runs one replay job in QuickJS. Plain JS (not TS) because it is also the
// entry file of a worker thread, which Node loads without a build step.
//
// Used two ways:
//  - as a worker (verify.ts, isolate: "worker"): the parent kills the thread
//    if it overruns, which is the only hard wall-clock guarantee — QuickJS's
//    interrupt handler is never consulted during long native operations
//    such as filling a huge array near the memory limit.
//  - imported directly (isolate: "inline") for fast tests and the game lab.
import { isMainThread, parentPort } from "node:worker_threads";
import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

const MAX_STACK_BYTES = 1024 * 1024;

/**
 * @param {{ mode?: "replay" | "meta", prelude: string, code: string, seed: string, logJson: string, timeLimitMs: number, memoryLimitBytes: number }} job
 * @returns {Promise<{ stage: "prelude" | "game" | "replay", ok: true, value: unknown } | { stage: "prelude" | "game" | "replay", ok: false, name: string, message: string }>}
 */
export async function runJob(job) {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(job.memoryLimitBytes);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + job.timeLimitMs));
  const vm = runtime.newContext();

  const evaluate = (stage, source, filename) => {
    const result = vm.evalCode(source, filename);
    if (result.error) {
      const dumped = vm.dump(result.error);
      result.error.dispose();
      if (dumped && typeof dumped === "object") {
        return { stage, ok: false, name: String(dumped.name ?? "Error"), message: String(dumped.message ?? dumped) };
      }
      return { stage, ok: false, name: "Error", message: String(dumped) };
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    return { stage, ok: true, value };
  };

  try {
    const prelude = evaluate("prelude", job.prelude, "prelude.js");
    if (!prelude.ok) return prelude;
    const game = evaluate("game", job.code, "game.js");
    if (!game.ok) return game;
    if (job.mode === "meta") return evaluate("replay", "__pl.meta()", "meta.js");
    return evaluate("replay", `__pl.replay(${JSON.stringify(job.seed)}, ${JSON.stringify(job.logJson)})`, "replay.js");
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  port.once("message", async (job) => {
    try {
      port.postMessage({ ok: true, outcome: await runJob(job) });
    } catch (e) {
      port.postMessage({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  });
}

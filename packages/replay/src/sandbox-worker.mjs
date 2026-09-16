// Runs one job in QuickJS: evaluates the prelude, the game, optional host
// scripts (e.g. the game-lab bots), then one expression whose value is the
// result. Plain JS (not TS) because it is also the entry file of a worker
// thread, which Node loads without a build step.
//
// Used two ways:
//  - as a worker (verify.ts, isolate: "worker"): the parent kills the thread
//    if it overruns, which is the only hard wall-clock guarantee — QuickJS's
//    interrupt handler is never consulted during long native operations
//    such as filling a huge array near the memory limit.
//  - imported directly (isolate: "inline") for fast tests.
import { isMainThread, parentPort } from "node:worker_threads";
import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

const MAX_STACK_BYTES = 1024 * 1024;

/**
 * @param {import("./sandbox-worker.d.mts").SandboxJob} job
 * @param {(() => void)} [onReady] Called once QuickJS is booted and the job is
 *   about to run, so the parent can time the game itself rather than the
 *   engine's start-up. Without this the kill deadline has to cover a cold
 *   WebAssembly compile too, which either kills slow-starting honest plays or
 *   hands a hostile game seconds of extra wall clock.
 * @returns {Promise<import("./sandbox-worker.d.mts").JobOutcome>}
 */
export async function runJob(job, onReady) {
  const QuickJS = await getQuickJS();
  onReady?.();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(job.memoryLimitBytes);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + job.timeLimitMs));
  const vm = runtime.newContext();

  const evaluate = (stage, source, filename) => {
    const started = Date.now();
    const result = vm.evalCode(source, filename);
    const evalMs = Date.now() - started;
    if (result.error) {
      const dumped = vm.dump(result.error);
      result.error.dispose();
      if (dumped && typeof dumped === "object") {
        return { stage, ok: false, name: String(dumped.name ?? "Error"), message: String(dumped.message ?? dumped), evalMs };
      }
      return { stage, ok: false, name: "Error", message: String(dumped), evalMs };
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    return { stage, ok: true, value, evalMs };
  };

  try {
    const prelude = evaluate("prelude", job.prelude, "prelude.js");
    if (!prelude.ok) return prelude;
    const game = evaluate("game", job.code, "game.js");
    if (!game.ok) return game;
    for (const [i, script] of (job.hostScripts ?? []).entries()) {
      const host = evaluate("prelude", script, `host-${i}.js`);
      if (!host.ok) return host;
    }
    return evaluate("run", job.expression, "run.js");
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  port.once("message", async (job) => {
    try {
      const outcome = await runJob(job, () => port.postMessage({ ready: true }));
      port.postMessage({ ok: true, outcome });
    } catch (e) {
      port.postMessage({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  });
}

/**
 * Locks down the global scope before any game code runs, identically in the
 * browser iframe and in QuickJS.
 *
 * This is about determinism, not security (the iframe sandbox and QuickJS
 * are the security boundary): anything that could make a live play differ
 * from its replay — wall clocks, timers, unseeded randomness, engine-specific
 * float approximations — is either replaced or turned into a clear error the
 * game lab can report back to the AI.
 */
import { DETERMINISTIC_MATH } from "./detmath";

export interface HostCapabilities {
  /** Monotonic milliseconds, for the browser host's frame loop only. */
  now: (() => number) | null;
  requestFrame: ((cb: (t: number) => void) => number) | null;
  cancelFrame: ((id: number) => void) | null;
}

const disabled = (what: string, instead: string) =>
  function () {
    throw new Error(`${what} isn't available in PlayLoop games. ${instead}`);
  };

function lock(target: object, key: string, value: unknown) {
  try {
    Object.defineProperty(target, key, { value, writable: false, configurable: false, enumerable: false });
  } catch {
    // Some hosts expose non-configurable globals; those are left as they are.
  }
}

/** Call once, before evaluating game code. Returns the host-only capabilities it captured. */
export function installSandboxGlobals(): HostCapabilities {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;

  const perf = g.performance;
  const caps: HostCapabilities = {
    now: perf && typeof perf.now === "function" ? perf.now.bind(perf) : null,
    requestFrame: typeof g.requestAnimationFrame === "function" ? g.requestAnimationFrame.bind(g) : null,
    cancelFrame: typeof g.cancelAnimationFrame === "function" ? g.cancelAnimationFrame.bind(g) : null,
  };

  for (const [name, fn] of Object.entries(DETERMINISTIC_MATH)) lock(Math, name, fn);
  lock(Math, "random", disabled("Math.random()", "Use ctx.random() so the server can replay the game."));

  const DateStub = disabled("Date", "Use ctx.time (seconds since the game started).");
  lock(DateStub, "now", DateStub);
  lock(g, "Date", DateStub);

  const timeInstead = "Put timing logic in update() using ctx.tick or ctx.time.";
  for (const name of ["setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask"]) {
    lock(g, name, disabled(`${name}()`, timeInstead));
  }
  for (const name of ["performance", "crypto", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB"]) {
    lock(g, name, undefined);
  }
  lock(g, "eval", disabled("eval()", "Write the code directly."));
  lock(g, "Function", disabled("Function()", "Write the code directly."));

  return caps;
}

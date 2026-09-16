/**
 * Entry point of the prelude bundle: the one script evaluated before game code
 * in every environment (browser iframe, QuickJS replay, test realms). Built to
 * a plain IIFE string by scripts/build-prelude.mjs, so both engines run the
 * exact same runtime code.
 *
 * Exposes two frozen globals:
 *  - `playloop`  what game code calls: playloop.game({ meta, init, update, render })
 *  - `__pl`      what the host calls: meta, replay, createSession, createRecorder
 */
import { contractIssues, type GameDefinition } from "./contract";
import { createInputRecorder, quantize } from "./input";
import { replay } from "./replay";
import { installSandboxGlobals } from "./sandbox";
import { createSession } from "./session";

const caps = installSandboxGlobals();

let registered: GameDefinition | null = null;
let registrationError: string | null = null;

const playloop = Object.freeze({
  version: 1,
  game(def: GameDefinition) {
    if (registered || registrationError) {
      registrationError = "playloop.game() was called more than once.";
      throw new Error(registrationError);
    }
    const issues = contractIssues(def);
    if (issues.length > 0) {
      registrationError = issues.join(" ");
      throw new Error(registrationError);
    }
    registered = def;
  },
});

const host = Object.freeze({
  /** JSON: { ok: true, meta } or { ok: false, detail }. */
  meta(): string {
    if (registrationError) return JSON.stringify({ ok: false, detail: registrationError });
    if (!registered) return JSON.stringify({ ok: false, detail: "The game never called playloop.game({...})." });
    return JSON.stringify({ ok: true, meta: registered.meta });
  },
  /** JSON ReplayResult. Takes and returns strings so it crosses any engine boundary cleanly. */
  replay(seed: string, logJson: string): string {
    if (registrationError) return JSON.stringify({ ok: false, reason: "contract_error", detail: registrationError });
    let log: unknown;
    try {
      log = JSON.parse(logJson);
    } catch {
      return JSON.stringify({ ok: false, reason: "bad_log", detail: "The input log isn't valid JSON." });
    }
    return JSON.stringify(replay(registered, String(seed), log));
  },
  createSession(seed: string) {
    if (!registered) throw new Error(registrationError ?? "The game never called playloop.game({...}).");
    return createSession(registered, String(seed));
  },
  game(): GameDefinition | null {
    return registered;
  },
  createRecorder: createInputRecorder,
  quantize,
  caps,
});

Object.defineProperty(globalThis, "playloop", { value: playloop, writable: false, configurable: false });
Object.defineProperty(globalThis, "__pl", { value: host, writable: false, configurable: false });

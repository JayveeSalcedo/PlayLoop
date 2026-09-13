/**
 * Re-runs a game from its seed and recorded inputs and reports what actually
 * happened. This is the function the server trusts: it runs inside the QuickJS
 * sandbox (via the prelude), and the score it returns is the only score paid.
 */
import { contractIssues, MAX_GAME_SECONDS, TICKS_PER_SECOND, type GameDefinition } from "./contract";
import { decodeInputLog } from "./input";
import { createSession, type EndReason } from "./session";

export type ReplayFailure =
  | "contract_error"
  | "bad_log"
  | "runtime_error"
  | "tick_mismatch"
  | "events_after_end"
  | "too_many_ticks";

export type ReplayResult =
  | { ok: true; score: number; ticks: number; endReason: EndReason; hash: string }
  | { ok: false; reason: ReplayFailure; detail: string; tick?: number };

export const HARD_MAX_TICKS = MAX_GAME_SECONDS * TICKS_PER_SECOND;

export function replay(def: GameDefinition | null, seed: string, log: unknown): ReplayResult {
  if (!def) return { ok: false, reason: "contract_error", detail: "The game never called playloop.game({...})." };
  const issues = contractIssues(def);
  if (issues.length > 0) return { ok: false, reason: "contract_error", detail: issues.join(" ") };

  let decoded;
  try {
    decoded = decodeInputLog(log);
  } catch (e) {
    return { ok: false, reason: "bad_log", detail: errorMessage(e) };
  }
  if (decoded.ticks > HARD_MAX_TICKS) {
    return { ok: false, reason: "too_many_ticks", detail: `The log claims ${decoded.ticks} ticks; the limit is ${HARD_MAX_TICKS}.` };
  }

  let session;
  try {
    session = createSession(def, seed);
  } catch (e) {
    return { ok: false, reason: "runtime_error", detail: `init: ${errorMessage(e)}`, tick: 0 };
  }

  const { events } = decoded;
  let next = 0;
  while (!session.ended) {
    if (session.tick >= HARD_MAX_TICKS) {
      return { ok: false, reason: "too_many_ticks", detail: "The game ran past the hard time limit." };
    }
    while (next < events.length && events[next]!.tick === session.tick) {
      session.push(events[next]!.event);
      next += 1;
    }
    if (next < events.length && events[next]!.tick < session.tick) {
      return { ok: false, reason: "bad_log", detail: "Input events are out of order." };
    }
    try {
      session.step();
    } catch (e) {
      return { ok: false, reason: "runtime_error", detail: errorMessage(e), tick: session.tick };
    }
  }

  if (next < events.length) {
    return {
      ok: false,
      reason: "events_after_end",
      detail: `The game ended at tick ${session.tick} but the log has input for tick ${events[next]!.tick}.`,
    };
  }
  if (decoded.ticks !== session.tick) {
    return {
      ok: false,
      reason: "tick_mismatch",
      detail: `The client ran ${decoded.ticks} ticks but the game ends at tick ${session.tick}.`,
    };
  }

  let hash: string;
  try {
    hash = session.hash();
  } catch (e) {
    return { ok: false, reason: "runtime_error", detail: `state: ${errorMessage(e)}`, tick: session.tick };
  }
  return { ok: true, score: session.score, ticks: session.tick, endReason: session.endReason!, hash };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return "Unknown error";
  }
}

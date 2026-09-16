/** Types and constants used by both the lab's server code and its client components (no Node imports). */

/** Flat payout during a game's calibration period (the plan's first 30 plays). */
export const CALIBRATION_PAYOUT = 30;

export type PlayVerdict =
  | { ok: true; score: number; ticks: number; endReason: string; verifyMs: number; elapsedSeconds: number; payoutPreview: number }
  | { ok: false; reason: string; detail: string; claimedScore: number; replayScore?: number; tick?: number; verifyMs: number; elapsedSeconds: number };

export type TamperKind = "inflate-score" | "idle-inputs" | "different-seed" | "fewer-ticks";

export const TAMPER_KINDS: { kind: TamperKind; label: string }[] = [
  { kind: "inflate-score", label: "Claim 100 more points" },
  { kind: "idle-inputs", label: "Remove all my inputs" },
  { kind: "different-seed", label: "Replay against another seed" },
  { kind: "fewer-ticks", label: "Say the game ended 5 s earlier" },
];

/** Plain-English names for verifier reasons. */
export const REASON_LABELS: Record<string, string> = {
  score_mismatch: "Score doesn't match the replay",
  tick_mismatch: "Game length doesn't match the replay",
  events_after_end: "Input after the game ended",
  too_fast: "Played faster than real time",
  too_many_ticks: "Longer than the game allows",
  bad_log: "Malformed input log",
  runtime_error: "The game crashed during replay",
  compile_error: "The game code doesn't parse",
  contract_error: "The game breaks the PlayLoop contract",
  timeout: "Replay took too long",
  out_of_memory: "Replay ran out of memory",
  too_large: "Too large",
};

/**
 * Every runtime version PlayLoop can still replay, by version number.
 *
 * This registry is what makes a recorded play reproducible for as long as it
 * exists. A play is scored by a specific simulation; if we replayed a play
 * recorded months ago against whatever prelude is deployed today, a single
 * changed digit in the RNG or in deterministic Math would re-score it — and
 * because verification compares the replay against the player's claim, honest
 * plays would start being rejected as tampering. That is the failure mode this
 * file exists to prevent.
 *
 * So old preludes are never removed and never edited. They are ~25 KB of
 * generated JavaScript each: cheap insurance against silently paying people
 * the wrong amount.
 *
 * Adding a version (see RUNTIME_VERSION in contract.ts for when):
 *   1. bump RUNTIME_VERSION
 *   2. pnpm --filter @playloop/runtime build
 *   3. node scripts/freeze-prelude.mjs
 *   4. import the new constant and add it to PRELUDES below
 */
import { RUNTIME_VERSION } from "./contract";
import { PRELUDE_V1 } from "./generated/prelude.v1";

export const PRELUDES: Readonly<Record<number, string>> = Object.freeze({
  1: PRELUDE_V1,
});

/** Runtime versions this build can still replay, oldest first. */
export const SUPPORTED_RUNTIME_VERSIONS: readonly number[] = Object.freeze(
  Object.keys(PRELUDES)
    .map(Number)
    .sort((a, b) => a - b),
);

/**
 * The prelude that scores plays recorded under `version`, or null if this
 * build doesn't have it. Callers must treat null as a hard failure — refusing
 * to verify is correct, replaying under a different runtime is not.
 */
export function preludeFor(version: number): string | null {
  return PRELUDES[version] ?? null;
}

/** The prelude new games are created under. */
export function currentPrelude(): string {
  const source = preludeFor(RUNTIME_VERSION);
  if (!source) {
    // Only reachable if someone bumped RUNTIME_VERSION without freezing it.
    throw new Error(
      `Runtime version ${RUNTIME_VERSION} has no frozen prelude. Run \`node scripts/freeze-prelude.mjs\` and register it in src/preludes.ts.`,
    );
  }
  return source;
}

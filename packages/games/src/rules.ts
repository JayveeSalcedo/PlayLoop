/**
 * Timing and score-plausibility rules for each game template.
 *
 * Pure (no DOM), so server actions can import it to validate a submitted
 * play. The templates read their durations from here too, so the client's
 * game clock and the server's check can't drift apart.
 */
import type { Difficulty } from "./types";

export type PlayableType = "catch" | "quiz" | "memory" | "reflex";

/** Difficulty -> spawn/timer speed multiplier, ported from the prototype's SPD (playloop-prototype.html:1429). */
export const SPEED_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 0.85,
  Medium: 1,
  Hard: 1.25,
};

/** The engine's 3-2-1-Go countdown before a template starts (runGame: 4 steps x 620 ms). */
export const COUNTDOWN_SECONDS = (4 * 620) / 1000;

/** Session length per template, in seconds. Quiz is self-terminating (0 = no shared clock). */
export const GAME_DURATION_SECONDS: Record<PlayableType, number> = {
  catch: 25,
  reflex: 20,
  memory: 45,
  quiz: 0,
};

export const QUIZ_SECONDS_PER_QUESTION: Record<Difficulty, number> = { Easy: 12, Medium: 10, Hard: 7 };

/** Timer-drift / frame-granularity allowance applied to minimum durations. */
const TOLERANCE_SECONDS = 1;
/** How long a started session stays submittable beyond its natural length (backgrounded tab, slow network). */
const STALE_SLACK_SECONDS = 10 * 60;

export interface PlayRules {
  /** A real client can't finish sooner than this after the session was issued. */
  minSeconds: number;
  /** Submissions later than this are treated as stale. */
  maxSeconds: number;
  /** Analytic ceiling on the score a real play can produce. */
  maxScore: number;
}

/** Upper bound on items a spawn loop can produce in `seconds`, given its fastest interval. */
function maxSpawns(seconds: number, fastestIntervalSeconds: number): number {
  return Math.ceil(seconds / fastestIntervalSeconds) + 2;
}

export function playRules(type: PlayableType, opts: { difficulty: Difficulty; questionCount?: number }): PlayRules {
  const sp = SPEED_BY_DIFFICULTY[opts.difficulty] ?? 1;
  switch (type) {
    case "catch": {
      const d = GAME_DURATION_SECONDS.catch;
      // catch.ts spawns at most one item per 0.24/sp s; a golden item is worth 30.
      return {
        minSeconds: COUNTDOWN_SECONDS + d - TOLERANCE_SECONDS,
        maxSeconds: COUNTDOWN_SECONDS + d + STALE_SLACK_SECONDS,
        maxScore: maxSpawns(d, 0.24 / sp) * 30,
      };
    }
    case "reflex": {
      const d = GAME_DURATION_SECONDS.reflex;
      // reflex.ts spawns at most one target per 0.26/sp s; a max-combo hit is worth 30.
      return {
        minSeconds: COUNTDOWN_SECONDS + d - TOLERANCE_SECONDS,
        maxSeconds: COUNTDOWN_SECONDS + d + STALE_SLACK_SECONDS,
        maxScore: maxSpawns(d, 0.26 / sp) * 30,
      };
    }
    case "memory": {
      const d = GAME_DURATION_SECONDS.memory;
      // Ends early once all 6 pairs match: 6 x 50, plus a time bonus of at most d x 5.
      return {
        minSeconds: COUNTDOWN_SECONDS + 6,
        maxSeconds: COUNTDOWN_SECONDS + d + STALE_SLACK_SECONDS,
        maxScore: 6 * 50 + d * 5,
      };
    }
    case "quiz": {
      const n = Math.max(1, opts.questionCount ?? 1);
      const per = QUIZ_SECONDS_PER_QUESTION[opts.difficulty] ?? 10;
      // Each answer is followed by a ~1.05 s reveal; a correct answer is worth at most 150.
      return {
        minSeconds: COUNTDOWN_SECONDS + n * 1,
        maxSeconds: COUNTDOWN_SECONDS + n * (per + 1.05) + STALE_SLACK_SECONDS,
        maxScore: n * 150,
      };
    }
  }
}

export type PlayRejection = "invalid_score" | "too_fast" | "expired" | "score_implausible";

export type PlayValidation = { ok: true } | { ok: false; reason: PlayRejection };

/** Checks a submitted play against its template's rules. `elapsedSeconds` must come from the server's clock. */
export function validatePlay(play: { elapsedSeconds: number; score: number }, rules: PlayRules): PlayValidation {
  if (!Number.isInteger(play.score) || play.score < 0) return { ok: false, reason: "invalid_score" };
  if (play.elapsedSeconds < rules.minSeconds) return { ok: false, reason: "too_fast" };
  if (play.elapsedSeconds > rules.maxSeconds) return { ok: false, reason: "expired" };
  if (play.score > rules.maxScore) return { ok: false, reason: "score_implausible" };
  return { ok: true };
}

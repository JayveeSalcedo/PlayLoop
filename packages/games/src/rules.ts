/**
 * Timing and score-plausibility rules for each game template.
 *
 * Pure (no DOM), so server actions can import it to validate a submitted
 * play. The templates read their durations from here too, so the client's
 * game clock and the server's check can't drift apart.
 */
import type { Difficulty } from "./types";

export type PlayableType = "catch" | "quiz" | "memory" | "reflex" | "merge" | "slide";

/** Difficulty -> spawn/timer speed multiplier, ported from the prototype's SPD (playloop-prototype.html:1429). */
export const SPEED_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 0.85,
  Medium: 1,
  Hard: 1.25,
};

/** The engine's 3-2-1-Go countdown before a template starts (runGame: 4 steps x 620 ms). */
export const COUNTDOWN_SECONDS = (4 * 620) / 1000;

/** Session length per template, in seconds. Quiz and merge are self-terminating (0 = no shared clock). */
export const GAME_DURATION_SECONDS: Record<PlayableType, number> = {
  catch: 25,
  reflex: 20,
  memory: 45,
  quiz: 0,
  merge: 0,
  slide: 75,
};

/** Difficulty -> how many random (guaranteed-solvable) slides scramble the board. */
export const SLIDE_SHUFFLE_MOVES: Record<Difficulty, number> = {
  Easy: 40,
  Medium: 80,
  Hard: 140,
};

export const QUIZ_SECONDS_PER_QUESTION: Record<Difficulty, number> = { Easy: 12, Medium: 10, Hard: 7 };

/**
 * Soft ceiling merge.ts enforces client-side (calls api.end() if it's hit) —
 * untimed like real 2048, but bounded so a play can't sit open indefinitely.
 */
export const MERGE_TIME_CAP_SECONDS = 6 * 60;


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
    case "merge": {
      // merge.ts merges tiles 2->4->...->1024 (10 tiers); a merge awards the new
      // tile's value. Building one 1024 tile takes exactly 9 tiers of merges
      // above the base, and every tier's merges sum to exactly 1024 points
      // regardless of path (fewer, bigger merges or more, smaller ones) — so
      // 9 * 1024 = 9216 is the true minimum score a win can be claimed with.
      // maxScore leaves headroom above that floor for the side-merges a real
      // board racks up while playing toward the win, bounded by the same
      // MERGE_TIME_CAP_SECONDS the client enforces (self-terminating, like quiz).
      return {
        minSeconds: COUNTDOWN_SECONDS + 5,
        maxSeconds: COUNTDOWN_SECONDS + MERGE_TIME_CAP_SECONDS + STALE_SLACK_SECONDS,
        maxScore: 9216 * 3,
      };
    }
    case "slide": {
      const d = GAME_DURATION_SECONDS.slide;
      // slide.ts ends early once the board is solved: a flat 300 for solving,
      // plus a time bonus of at most d x 3 for finishing early — same shape as
      // memory's completion + time-bonus scoring. minSeconds is a floor, not a
      // tight bound: solve length varies with the random (but always solvable)
      // scramble, so this only rules out a literally-instant submission.
      return {
        minSeconds: COUNTDOWN_SECONDS + 5,
        maxSeconds: COUNTDOWN_SECONDS + d + STALE_SLACK_SECONDS,
        maxScore: 300 + d * 3,
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

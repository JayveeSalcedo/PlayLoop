/** Difficulty affects spawn/timer speed via SPEED_BY_DIFFICULTY in engine.ts. */
export type Difficulty = "Easy" | "Medium" | "Hard";

/**
 * The interface a running game's `start()` uses to report score, drive the
 * shared timer ring, and end the session. Handed to each template by the
 * engine — templates never touch the host chrome (timer/score/quit) directly.
 */
export interface GameApi {
  /** Add (or subtract, with a negative n) to the score. x/y (host-relative px) show a floating +N/-N label. */
  add(points: number, x?: number, y?: number, label?: string): void;
  /** End the session now (used by self-terminating games like Quiz). */
  end(): void;
  /** Override the countdown ring, e.g. per-question timers in Quiz. */
  timer(left: number, total: number): void;
  /** Seconds remaining on the current timer. */
  left(): number;
}

/**
 * A game template: given a duration rule and a start() that mounts into the
 * stage element, runs until it calls api.end() or the shared clock expires.
 * start() must return a cleanup function.
 */
export interface GameDefinition<TConfig> {
  /** Total seconds for the session; return 0 for a self-terminating game (e.g. Quiz ends after the last question). */
  duration(config: TConfig): number;
  /** Optional hint text shown briefly after the countdown. */
  hint?: string;
  start(stage: HTMLElement, config: TConfig, api: GameApi): () => void;
}

export interface RunGameResult {
  score: number;
}

export interface QuizQuestion {
  q: string;
  a: string[];
  /** Index into `a` of the correct answer. */
  c: number;
}

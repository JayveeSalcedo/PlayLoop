/** "prelude" also covers trusted host scripts: a failure there is a platform bug, not the game's. */
export type JobStage = "prelude" | "game" | "run";

export interface SandboxJob {
  prelude: string;
  code: string;
  /** Trusted scripts evaluated after the game, before `expression` (e.g. the game-lab bots). */
  hostScripts?: string[];
  /** Evaluated last; its (dumped) value is the job's result. */
  expression: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
}

export type JobOutcome =
  | { stage: JobStage; ok: true; value: unknown; evalMs: number }
  | { stage: JobStage; ok: false; name: string; message: string; evalMs: number };

export function runJob(job: SandboxJob, onReady?: () => void): Promise<JobOutcome>;

export type JobStage = "prelude" | "game" | "replay";

export interface ReplayJob {
  /** "meta" evaluates the game and returns __pl.meta() instead of replaying. Default "replay". */
  mode?: "replay" | "meta";
  prelude: string;
  code: string;
  seed: string;
  logJson: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
}

export type JobOutcome =
  | { stage: JobStage; ok: true; value: unknown }
  | { stage: JobStage; ok: false; name: string; message: string };

export function runJob(job: ReplayJob): Promise<JobOutcome>;

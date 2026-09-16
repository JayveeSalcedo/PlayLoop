/**
 * The create / change loop:
 *
 *   AI writes the game ─▶ game lab checks it ─▶ passes? done
 *                              │
 *                              └─ fails ─▶ AI fixes it using the lab report (up to maxFixRounds)
 *
 * Provider rate limits are waited out (with progress events) instead of
 * failing, since Groq's free tier allows roughly one generation a minute.
 */
import { checkGame, type LabReport } from "@playloop/replay";
import { GAME_OUTPUT_SCHEMA, GAME_OUTPUT_SCHEMA_NAME, parseGameOutput, type GameOutput } from "./output";
import { changeMessage, createMessage, estimateTokens, fixMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts";
import { AiError, type AiProvider, type AiTask, type Effort, type TokenUsage } from "./types";

export type ProgressStep = "writing" | "checking" | "fixing" | "waiting" | "done" | "failed";

export interface ProgressEvent {
  step: ProgressStep;
  /** 0 for the first attempt, 1..maxFixRounds for fixes. */
  round: number;
  message: string;
  /** For "waiting": how long until the next try. */
  waitMs?: number;
}

export interface Attempt {
  round: number;
  task: AiTask;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  output: GameOutput | null;
  report: LabReport | null;
  error: { kind: string; message: string } | null;
}

export interface PipelineResult {
  /** True when the final game passed every game-lab check. */
  ok: boolean;
  provider: string;
  promptVersion: string;
  /** The best game produced: the passing one, else the last one that loaded, else null. */
  game: (GameOutput & { report: LabReport }) | null;
  attempts: Attempt[];
  usage: TokenUsage;
  durationMs: number;
  /** Why it isn't ok, in plain English. */
  problem: string | null;
}

export interface PipelineOptions {
  provider: AiProvider;
  maxFixRounds?: number;
  onProgress?: (event: ProgressEvent) => void;
  /** Injected in tests; defaults to the real game lab. */
  check?: (code: string) => Promise<LabReport>;
  /** Injected in tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** How many times one AI call may be retried after a rate limit. */
  maxRateLimitRetries?: number;
  effort?: Effort;
}

const DEFAULT_MAX_FIX_ROUNDS = 2;
const MAX_WAIT_MS = 65_000;
/** Output room requested beyond what the prompt uses, when the provider has a per-minute token cap. */
const MIN_OUTPUT_TOKENS = 2_500;

export function createGame(idea: string, options: PipelineOptions): Promise<PipelineResult> {
  if (!idea.trim()) return Promise.resolve(failedBeforeStart(options, "Describe the game you want first."));
  return run(options, { task: "create", message: createMessage(idea) });
}

export function changeGame(code: string, instruction: string, options: PipelineOptions): Promise<PipelineResult> {
  if (!instruction.trim()) return Promise.resolve(failedBeforeStart(options, "Describe the change you want first."));
  return run(options, { task: "change", message: changeMessage(code, instruction) });
}

async function run(options: PipelineOptions, first: { task: AiTask; message: string }): Promise<PipelineResult> {
  const started = Date.now();
  const provider = options.provider;
  const maxFixRounds = options.maxFixRounds ?? DEFAULT_MAX_FIX_ROUNDS;
  const check = options.check ?? ((code: string) => checkGame(code));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const progress = options.onProgress ?? (() => {});
  const attempts: Attempt[] = [];

  let task = first.task;
  let message = first.message;
  let best: PipelineResult["game"] = null;
  let problem: string | null = null;

  for (let round = 0; round <= maxFixRounds; round++) {
    progress({
      step: round === 0 ? "writing" : "fixing",
      round,
      message: round === 0 ? (task === "change" ? "Making your change…" : "Writing the game…") : `Fixing what the checks found (round ${round} of ${maxFixRounds})…`,
    });

    const attempt: Attempt = { round, task, model: provider.model(task), usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, output: null, report: null, error: null };
    attempts.push(attempt);

    let output: GameOutput;
    try {
      const result = await callWithRetries(provider, task, message, { options, sleep, progress, round });
      attempt.model = result.model;
      attempt.usage = result.usage;
      attempt.latencyMs = result.latencyMs;
      output = parseGameOutput(result.json);
      attempt.output = output;
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("provider_error", e instanceof Error ? e.message : String(e));
      attempt.error = { kind: err.kind, message: err.message };
      problem = err.message;
      // Unfixable by trying again with the same setup.
      if (["not_configured", "auth", "refused", "request_too_large"].includes(err.kind)) break;
      // A malformed answer or a long one: retry the same step as the next round, if any remain.
      continue;
    }

    progress({ step: "checking", round, message: "Testing it with bots…" });
    const report = await check(output.code);
    attempt.report = report;

    const loaded = report.checks.find((c) => c.id === "contract")?.status === "pass";
    if (report.verdict === "pass") {
      best = { ...output, report };
      problem = null;
      break;
    }
    if (loaded || !best) best = { ...output, report };
    const failed = report.checks.filter((c) => c.status === "fail").map((c) => c.title);
    problem = `The game still fails: ${failed.join(", ")}.`;

    // Next round fixes this version.
    task = "fix";
    message = fixMessage(output.code, report.fixPrompt ?? "The game lab found problems. Fix them and return the complete game.");
  }

  const ok = best?.report.verdict === "pass";
  const usage = attempts.reduce((sum, a) => ({ inputTokens: sum.inputTokens + a.usage.inputTokens, outputTokens: sum.outputTokens + a.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
  progress(ok ? { step: "done", round: attempts.length - 1, message: "Your game passed every check." } : { step: "failed", round: attempts.length - 1, message: problem ?? "The game couldn't be made." });

  return { ok, provider: provider.id, promptVersion: PROMPT_VERSION, game: best, attempts, usage, durationMs: Date.now() - started, problem: ok ? null : problem };
}

async function callWithRetries(
  provider: AiProvider,
  task: AiTask,
  message: string,
  ctx: { options: PipelineOptions; sleep: (ms: number) => Promise<void>; progress: (e: ProgressEvent) => void; round: number },
) {
  const retries = ctx.options.maxRateLimitRetries ?? 4;
  const maxOutputTokens = outputBudget(provider, message);
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate({
        task,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: message }],
        schema: GAME_OUTPUT_SCHEMA,
        schemaName: GAME_OUTPUT_SCHEMA_NAME,
        maxOutputTokens,
        effort: ctx.options.effort ?? (provider.id === "groq" ? "low" : "medium"),
      });
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== "rate_limited" || attempt >= retries) throw e;
      const waitMs = Math.min(MAX_WAIT_MS, Math.max(2_000, e.retryAfterMs ?? 20_000));
      ctx.progress({ step: "waiting", round: ctx.round, waitMs, message: `The AI service is busy, trying again in ${Math.ceil(waitMs / 1000)} s…` });
      await ctx.sleep(waitMs);
    }
  }
}

/** Keeps prompt + requested output under a per-minute token cap, when the provider has one. */
function outputBudget(provider: AiProvider, message: string): number {
  const cap = provider.capabilities.maxOutputTokens;
  const tpm = provider.capabilities.tokensPerMinute;
  if (!tpm) return cap;
  const promptTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(message) + 200;
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(cap, tpm - promptTokens));
}

function failedBeforeStart(options: PipelineOptions, problem: string): PipelineResult {
  return { ok: false, provider: options.provider.id, promptVersion: PROMPT_VERSION, game: null, attempts: [], usage: { inputTokens: 0, outputTokens: 0 }, durationMs: 0, problem };
}

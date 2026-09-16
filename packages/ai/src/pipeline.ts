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
  /**
   * Epoch ms after which the pipeline must not start anything new. A
   * serverless function is killed at its time limit — possibly in the middle of
   * waiting out a rate limit — so the caller passes its own limit minus room
   * for one more round and for saving the result. At the deadline the pipeline
   * stops and returns the best game so far instead of being cut off mid-sleep
   * with nothing to show.
   */
  deadlineAt?: number;
  /** Injected in tests; defaults to Date.now. */
  now?: () => number;
}

/** Thrown inside the loop when a wait would run past options.deadlineAt; never escapes run(). */
class DeadlineReached extends Error {}

const DEFAULT_MAX_FIX_ROUNDS = 2;
const MAX_WAIT_MS = 65_000;
/** Output room requested beyond what the prompt uses, when the provider has a per-minute token cap. */
const MIN_OUTPUT_TOKENS = 2_500;

export function createGame(idea: string, options: PipelineOptions): Promise<PipelineResult> {
  if (!idea.trim()) return Promise.resolve(failedBeforeStart(options, "Describe the game you want first."));
  return run(options, createState(idea, options));
}

export function changeGame(code: string, instruction: string, options: PipelineOptions): Promise<PipelineResult> {
  if (!instruction.trim()) return Promise.resolve(failedBeforeStart(options, "Describe the change you want first."));
  return run(options, changeState(code, instruction, options));
}

/**
 * A generation in progress, as plain JSON, so it can be saved between rounds and
 * picked up by a different process.
 *
 * createGame/changeGame run every round back to back in one call. A serverless
 * host can't: a whole generation (up to three model calls, each followed by the
 * game lab's bot checks) can outlast one function invocation. There, each
 * invocation loads the state, calls advance() once, and saves what comes back —
 * the same loop, one iteration per request.
 */
export interface PipelineState {
  v: 1;
  /** What the next round asks the AI for. */
  task: AiTask;
  /** The message the next round sends. */
  message: string;
  /** Index of the next round; 0 is the first attempt. */
  round: number;
  maxFixRounds: number;
  /** The best game so far: the passing one, else the last one that loaded. */
  best: PipelineResult["game"];
  problem: string | null;
  attempts: Attempt[];
  /** Nothing more to do: passed, gave up, or ran out of rounds or time. */
  finished: boolean;
  /** Time spent inside rounds so far, across however many invocations ran them. */
  elapsedMs: number;
}

export function createState(idea: string, options: Pick<PipelineOptions, "maxFixRounds"> = {}): PipelineState {
  return initialState("create", createMessage(idea), options);
}

export function changeState(code: string, instruction: string, options: Pick<PipelineOptions, "maxFixRounds"> = {}): PipelineState {
  return initialState("change", changeMessage(code, instruction), options);
}

function initialState(task: AiTask, message: string, options: Pick<PipelineOptions, "maxFixRounds">): PipelineState {
  return {
    v: 1,
    task,
    message,
    round: 0,
    maxFixRounds: options.maxFixRounds ?? DEFAULT_MAX_FIX_ROUNDS,
    best: null,
    problem: null,
    attempts: [],
    finished: false,
    elapsedMs: 0,
  };
}

async function run(options: PipelineOptions, initial: PipelineState): Promise<PipelineResult> {
  let state = initial;
  while (!state.finished) state = await advance(state, options);
  return finish(state, options);
}

/**
 * Runs one round — ask the AI, then check what it wrote — and returns the next
 * state. Doesn't mutate its input. Emits the same progress events as a full run,
 * except the final done/failed, which finish() emits.
 */
export async function advance(previous: PipelineState, options: PipelineOptions): Promise<PipelineState> {
  if (previous.finished) return previous;
  const state: PipelineState = { ...previous, attempts: [...previous.attempts] };
  const started = Date.now();
  const provider = options.provider;
  const check = options.check ?? ((code: string) => checkGame(code));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const progress = options.onProgress ?? (() => {});
  const now = options.now ?? Date.now;
  const done = (): PipelineState => ({ ...state, elapsedMs: state.elapsedMs + (Date.now() - started) });

  const { round, task } = state;
  if (round > state.maxFixRounds) return { ...state, finished: true };
  if (options.deadlineAt !== undefined && now() >= options.deadlineAt) {
    state.problem = state.best ? `Ran out of time before the checks passed. ${state.problem ?? ""}`.trim() : "Ran out of time before the game was written.";
    state.finished = true;
    return done();
  }

  progress({
    step: round === 0 ? "writing" : "fixing",
    round,
    message: round === 0 ? (task === "change" ? "Making your change…" : "Writing the game…") : `Fixing what the checks found (round ${round} of ${state.maxFixRounds})…`,
  });

  const attempt: Attempt = { round, task, model: provider.model(task), usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, output: null, report: null, error: null };
  state.attempts.push(attempt);
  state.round = round + 1;

  let output: GameOutput;
  try {
    const result = await callWithRetries(provider, task, state.message, { options, sleep, progress, round, now });
    attempt.model = result.model;
    attempt.usage = result.usage;
    attempt.latencyMs = result.latencyMs;
    output = parseGameOutput(result.json);
    attempt.output = output;
  } catch (e) {
    if (e instanceof DeadlineReached) {
      attempt.error = { kind: "rate_limited", message: e.message };
      state.problem = e.message;
      state.finished = true;
      return done();
    }
    const err = e instanceof AiError ? e : new AiError("provider_error", e instanceof Error ? e.message : String(e));
    attempt.error = { kind: err.kind, message: err.message };
    state.problem = err.message;
    // Unfixable by trying again with the same setup.
    if (["not_configured", "auth", "refused", "request_too_large"].includes(err.kind)) state.finished = true;
    // Otherwise a malformed or overlong answer: retry the same step as the next round, if any remain.
    if (state.round > state.maxFixRounds) state.finished = true;
    return done();
  }

  progress({ step: "checking", round, message: "Testing it with bots…" });
  const report = await check(output.code);
  attempt.report = report;

  const loaded = report.checks.find((c) => c.id === "contract")?.status === "pass";
  if (report.verdict === "pass") {
    state.best = { ...output, report };
    state.problem = null;
    state.finished = true;
    return done();
  }
  if (loaded || !state.best) state.best = { ...output, report };
  const failed = report.checks.filter((c) => c.status === "fail").map((c) => c.title);
  state.problem = `The game still fails: ${failed.join(", ")}.`;

  // Next round fixes this version.
  state.task = "fix";
  state.message = fixMessage(output.code, report.fixPrompt ?? "The game lab found problems. Fix them and return the complete game.");
  if (state.round > state.maxFixRounds) state.finished = true;
  return done();
}

/** The result of a finished (or abandoned) state, emitting the final progress event. */
export function finish(state: PipelineState, options: Pick<PipelineOptions, "provider" | "onProgress">): PipelineResult {
  const ok = state.best?.report.verdict === "pass";
  const usage = state.attempts.reduce(
    (sum, a) => ({ inputTokens: sum.inputTokens + a.usage.inputTokens, outputTokens: sum.outputTokens + a.usage.outputTokens }),
    { inputTokens: 0, outputTokens: 0 },
  );
  const round = Math.max(0, state.attempts.length - 1);
  (options.onProgress ?? (() => {}))(
    ok ? { step: "done", round, message: "Your game passed every check." } : { step: "failed", round, message: state.problem ?? "The game couldn't be made." },
  );
  return {
    ok,
    provider: options.provider.id,
    promptVersion: PROMPT_VERSION,
    game: state.best,
    attempts: state.attempts,
    usage,
    durationMs: state.elapsedMs,
    problem: ok ? null : state.problem,
  };
}

async function callWithRetries(
  provider: AiProvider,
  task: AiTask,
  message: string,
  ctx: { options: PipelineOptions; sleep: (ms: number) => Promise<void>; progress: (e: ProgressEvent) => void; round: number; now: () => number },
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
      // Waiting past the deadline would just get the function killed mid-sleep.
      if (ctx.options.deadlineAt !== undefined && ctx.now() + waitMs >= ctx.options.deadlineAt) {
        throw new DeadlineReached("The AI service is busy and there wasn't time to wait for it. Try again in a minute.");
      }
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

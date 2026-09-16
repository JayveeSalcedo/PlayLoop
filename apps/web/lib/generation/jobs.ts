/**
 * AI generation jobs that survive serverless: create a game from an idea,
 * change a version, or fix what its checks found.
 *
 * The lab ran a generation as one detached promise in a long-lived dev server,
 * tracked in a globalThis map. None of that survives a serverless platform: the
 * function is frozen the moment it responds, the next request may land on a
 * different instance, and on Vercel's Hobby limits a whole generation (up to
 * three model calls, each followed by the game lab's bot checks) doesn't fit in
 * one invocation anyway.
 *
 * So generation_jobs is the job, and a job advances one round per request:
 *
 *   createJob ─▶ queued ──step──▶ running ──(one round)──▶ queued ──step──▶ … ─▶ done | failed
 *
 *  - The studio drives it, calling step until the job ends. Closing the tab just
 *    pauses it; coming back continues.
 *  - A step claims the job with a conditional UPDATE (queued → running), the same
 *    claim pattern play submission uses, so two concurrent steps can't both run
 *    a round.
 *  - While a round runs, the step refreshes heartbeat_at. If the invocation dies
 *    mid-round the heartbeat goes quiet, and the next read marks the job failed
 *    rather than leaving the creator watching a spinner forever. No cron, no
 *    queue service — derived at read time, like voucher expiry.
 *  - The pipeline's state is saved between rounds, so the next step (on any
 *    instance) picks up exactly where the last one stopped.
 *
 * The provider comes from @playloop/ai's env-driven registry; nothing here knows
 * which one it is.
 */
import {
  advance,
  changeState,
  createState,
  finish,
  getProvider,
  type AiProvider,
  type PipelineResult,
  type PipelineState,
  type ProgressEvent,
} from "@playloop/ai";
import { getDb, schema } from "@playloop/db";
import { codeScoreTarget } from "@playloop/economy";
import { fnv1a, RUNTIME_VERSION } from "@playloop/runtime";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

export type JobKind = "create" | "change" | "fix";
export type JobStatus = "queued" | "running" | "done" | "failed";

export const MAX_REQUEST_CHARS = 1_000;

/**
 * Whole-platform token spend per day. The default is the lab's: Groq's free tier
 * allows ~200K tokens a day for the account, so stop a bit before. Set
 * AI_DAILY_TOKEN_BUDGET for a paid provider.
 */
export function dailyTokenBudget(): number {
  const n = Number(process.env.AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

/** Generations one creator may start per day. */
export const DAILY_JOBS_PER_PROFILE = 20;

/**
 * The step route's maxDuration, in ms. Kept here so the pipeline deadline and the
 * stale-heartbeat window are derived from the same number as the route's limit.
 */
export const STEP_MAX_DURATION_MS = 300_000;

/**
 * Time a round needs once its model call starts: a long answer plus the game
 * lab's checks. The pipeline won't begin a rate-limit wait that would eat into
 * this, so a step ends cleanly instead of being killed mid-call.
 */
const ROUND_RESERVE_MS = 150_000;

/** How often a running step refreshes its heartbeat. */
export const HEARTBEAT_EVERY_MS = 20_000;

/** A running job whose heartbeat is this old has lost its invocation. */
export const STALE_RUNNING_MS = 90_000;

/** A queued job nobody has stepped in this long was abandoned (tab closed and never reopened). */
export const STALE_QUEUED_MS = 30 * 60_000;

export interface JobView {
  id: string;
  kind: JobKind;
  status: JobStatus;
  events: ProgressEvent[];
  problem: string | null;
  gameId: string | null;
  resultVersionId: string | null;
  calls: number;
  tokens: number;
  createdAt: string;
  finishedAt: string | null;
}

type JobRow = typeof schema.generationJobs.$inferSelect;

export function toView(row: JobRow): JobView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    events: (row.events ?? []) as ProgressEvent[],
    problem: row.problem,
    gameId: row.gameId,
    resultVersionId: row.resultVersionId,
    calls: row.calls,
    tokens: row.tokens,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * The state that's saved between rounds. Each attempt's output and lab report
 * are dropped: finish() only reads attempts for usage and models, and the best
 * game (which it does need) is kept whole. Without this the saved state would
 * carry every round's full code and report.
 */
export function slimState(state: PipelineState): PipelineState {
  return { ...state, attempts: state.attempts.map((a) => ({ ...a, output: null, report: null })) };
}

export function usageOf(state: PipelineState): { calls: number; tokens: number } {
  return {
    calls: state.attempts.length,
    tokens: state.attempts.reduce((sum, a) => sum + a.usage.inputTokens + a.usage.outputTokens, 0),
  };
}

export type StartJobResult = { ok: true; job: JobView } | { ok: false; status: number; error: string };

/**
 * Starts a job. Nothing runs yet — the first step does. `create` needs `request`
 * (the idea); `change` needs `request` and `versionId`; `fix` needs `versionId`
 * and uses that version's own lab feedback as the instruction.
 */
export async function createJob(input: {
  profileId: string;
  kind: JobKind;
  request?: string;
  versionId?: string;
}): Promise<StartJobResult> {
  const db = getDb();
  const text = String(input.request ?? "").trim();

  if (input.kind !== "fix") {
    if (!text) return { ok: false, status: 400, error: input.kind === "create" ? "Describe the game you want first." : "Describe the change you want first." };
    if (text.length > MAX_REQUEST_CHARS) return { ok: false, status: 400, error: `Keep it under ${MAX_REQUEST_CHARS} characters.` };
  }

  try {
    getProvider();
  } catch (e) {
    return { ok: false, status: 503, error: e instanceof Error ? e.message : "The AI isn't configured." };
  }

  await sweepStale(input.profileId);

  const [open] = await db
    .select({ n: count() })
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.profileId, input.profileId), inArray(schema.generationJobs.status, ["queued", "running"])));
  if ((open?.n ?? 0) > 0) return { ok: false, status: 409, error: "The AI is still working on your last request." };

  const [today] = await db
    .select({ n: count() })
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.profileId, input.profileId), gte(schema.generationJobs.createdAt, sql`date_trunc('day', now())`)));
  if ((today?.n ?? 0) >= DAILY_JOBS_PER_PROFILE) {
    return { ok: false, status: 429, error: "You've made a lot of games today. Try again tomorrow." };
  }

  const [spent] = await db
    .select({ tokens: sql<number>`coalesce(sum(${schema.generationJobs.tokens}), 0)`.mapWith(Number) })
    .from(schema.generationJobs)
    .where(gte(schema.generationJobs.createdAt, sql`date_trunc('day', now())`));
  if ((spent?.tokens ?? 0) >= dailyTokenBudget()) {
    return { ok: false, status: 429, error: "The game studio is resting until tomorrow. Try again then." };
  }

  let state: PipelineState;
  let gameId: string | null = null;
  let baseVersionId: string | null = null;
  let request = text;

  if (input.kind === "create") {
    state = createState(text);
  } else {
    if (!input.versionId) return { ok: false, status: 400, error: "Pick a version to change." };
    const [base] = await db
      .select({ id: schema.gameVersions.id, gameId: schema.gameVersions.gameId, code: schema.gameVersions.code, report: schema.gameVersions.report, creatorId: schema.games.creatorId })
      .from(schema.gameVersions)
      .innerJoin(schema.games, eq(schema.gameVersions.gameId, schema.games.id))
      .where(eq(schema.gameVersions.id, input.versionId));
    // Same answer for "doesn't exist" and "isn't yours".
    if (!base || base.creatorId !== input.profileId) return { ok: false, status: 404, error: "That version doesn't exist." };
    gameId = base.gameId;
    baseVersionId = base.id;

    if (input.kind === "fix") {
      const fixPrompt = (base.report as { fixPrompt?: unknown } | null)?.fixPrompt;
      if (typeof fixPrompt !== "string" || !fixPrompt) return { ok: false, status: 409, error: "The checks didn't find anything to fix." };
      state = changeState(base.code, fixPrompt);
      request = "Fix what the checks found";
    } else {
      state = changeState(base.code, text);
    }
  }

  const [row] = await db
    .insert(schema.generationJobs)
    .values({
      profileId: input.profileId,
      gameId,
      baseVersionId,
      kind: input.kind,
      request,
      state: state as unknown as Record<string, unknown>,
    })
    .returning();
  return { ok: true, job: toView(row!) };
}

/**
 * Fails jobs whose invocation is gone, so neither the creator's UI nor their
 * one-open-job limit is stuck behind them. Run before any read that decides
 * something from job status.
 */
export async function sweepStale(profileId?: string): Promise<void> {
  const db = getDb();
  const mine = profileId ? eq(schema.generationJobs.profileId, profileId) : undefined;

  await db
    .update(schema.generationJobs)
    .set({ status: "failed", state: null, problem: "The generator stopped responding. Try again.", finishedAt: sql`now()` })
    .where(
      and(
        mine,
        eq(schema.generationJobs.status, "running"),
        lt(schema.generationJobs.heartbeatAt, sql`now() - make_interval(secs => ${STALE_RUNNING_MS / 1000})`),
      ),
    );

  await db
    .update(schema.generationJobs)
    .set({ status: "failed", state: null, problem: "This request was left unfinished. Start it again.", finishedAt: sql`now()` })
    .where(
      and(
        mine,
        eq(schema.generationJobs.status, "queued"),
        lt(sql`coalesce(${schema.generationJobs.heartbeatAt}, ${schema.generationJobs.createdAt})`, sql`now() - make_interval(secs => ${STALE_QUEUED_MS / 1000})`),
      ),
    );
}

export async function getJob(jobId: string, profileId: string): Promise<JobView | null> {
  await sweepStale(profileId);
  const [row] = await getDb()
    .select()
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.id, jobId), eq(schema.generationJobs.profileId, profileId)));
  return row ? toView(row) : null;
}

export async function listJobs(profileId: string, limit = 10): Promise<JobView[]> {
  await sweepStale(profileId);
  const rows = await getDb()
    .select()
    .from(schema.generationJobs)
    .where(eq(schema.generationJobs.profileId, profileId))
    .orderBy(desc(schema.generationJobs.createdAt))
    .limit(limit);
  return rows.map(toView);
}

export interface StepOptions {
  /** Defaults to the configured provider. Injected by tests. */
  provider?: AiProvider;
  /** Defaults to the real game lab. Injected by tests. */
  check?: Parameters<typeof advance>[1]["check"];
}

/**
 * Runs one round of a job, if it's this caller's turn. Returns the job as it
 * stands afterwards; a job someone else is already stepping, or that has ended,
 * is returned unchanged.
 */
export async function stepJob(jobId: string, profileId: string, options: StepOptions = {}): Promise<JobView | null> {
  const db = getDb();
  await sweepStale(profileId);

  const [claimed] = await db
    .update(schema.generationJobs)
    .set({ status: "running", heartbeatAt: sql`now()` })
    .where(and(eq(schema.generationJobs.id, jobId), eq(schema.generationJobs.profileId, profileId), eq(schema.generationJobs.status, "queued")))
    .returning();
  if (!claimed) return getJob(jobId, profileId);

  const events = [...((claimed.events ?? []) as ProgressEvent[])];
  const heartbeat = setInterval(() => {
    void db
      .update(schema.generationJobs)
      .set({ heartbeatAt: sql`now()`, events })
      .where(and(eq(schema.generationJobs.id, jobId), eq(schema.generationJobs.status, "running")))
      .catch(() => {});
  }, HEARTBEAT_EVERY_MS);

  try {
    let provider: AiProvider;
    try {
      provider = options.provider ?? getProvider();
    } catch (e) {
      return await endJob(jobId, { problem: e instanceof Error ? e.message : "The AI isn't configured.", events });
    }

    const pipelineOptions = {
      provider,
      check: options.check,
      onProgress: (e: ProgressEvent) => void events.push(e),
      deadlineAt: Date.now() + STEP_MAX_DURATION_MS - ROUND_RESERVE_MS,
    };

    const state = claimed.state as unknown as PipelineState | null;
    if (!state) return await endJob(jobId, { problem: "This request lost its progress. Start it again.", events });

    const next = await advance(state, pipelineOptions);
    const usage = usageOf(next);

    if (!next.finished) {
      const [row] = await db
        .update(schema.generationJobs)
        .set({ status: "queued", state: slimState(next) as unknown as Record<string, unknown>, events, ...usage, heartbeatAt: sql`now()` })
        .where(eq(schema.generationJobs.id, jobId))
        .returning();
      return toView(row!);
    }

    const result = finish(next, pipelineOptions);
    return await saveResult(claimed, result, events, usage);
  } catch (e) {
    // Something the pipeline doesn't classify — the game lab's sandbox failing,
    // a database error. The round is lost; say so rather than retrying blindly.
    console.error("generation step failed", e);
    return await endJob(jobId, { problem: "Something went wrong making that game. Try again.", events });
  } finally {
    clearInterval(heartbeat);
  }
}

async function endJob(jobId: string, end: { problem: string; events: ProgressEvent[] }): Promise<JobView> {
  const [row] = await getDb()
    .update(schema.generationJobs)
    .set({ status: "failed", state: null, problem: end.problem, events: end.events, finishedAt: sql`now()` })
    .where(eq(schema.generationJobs.id, jobId))
    .returning();
  return toView(row!);
}

/** Title -> URL slug with a random suffix, the same scheme as template games. */
function toSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "game";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Stores what the generation produced as a new, immutable game version and ends
 * the job.
 *
 * A create makes a draft game with version 1. A change or fix adds the next
 * version to the existing game and never touches an earlier one. On a draft the
 * new version becomes current, as the studio's working copy; on a game that's
 * already submitted or live, current is left alone — what players get only
 * changes when a version is published.
 *
 * A version is kept even when it failed its checks, so the creator can see why
 * and ask for a fix; startPlay never lets anyone earn on a failing version. A
 * game that never loaded at all isn't stored: there's nothing to play or fix.
 */
async function saveResult(
  job: JobRow,
  result: PipelineResult,
  events: ProgressEvent[],
  usage: { calls: number; tokens: number },
): Promise<JobView> {
  const db = getDb();
  const game = result.game;
  const meta = game?.report.meta;

  if (!game || !meta) {
    const [row] = await db
      .update(schema.generationJobs)
      .set({ status: "failed", state: null, events, ...usage, problem: result.problem ?? "The AI couldn't make a game that loads.", finishedAt: sql`now()` })
      .where(eq(schema.generationJobs.id, job.id))
      .returning();
    return toView(row!);
  }

  const lastModel = [...result.attempts].reverse().find((a) => !a.error)?.model ?? result.attempts.at(-1)?.model ?? null;
  const version = {
    via: job.kind === "create" ? ("ai-create" as const) : job.kind === "fix" ? ("ai-fix" as const) : ("ai-change" as const),
    request: job.request,
    code: game.code,
    contentHash: fnv1a(game.code),
    meta: meta as unknown as Record<string, unknown>,
    // checkGame ran in this build, under this runtime.
    runtimeVersion: RUNTIME_VERSION,
    promptVersion: result.promptVersion,
    provider: result.provider,
    model: lastModel,
    title: game.title,
    summary: game.summary,
    notes: game.notes,
    validation: game.report.verdict,
    report: game.report as unknown as Record<string, unknown>,
    // Economy calibration only; never decides validity.
    scoreTarget: codeScoreTarget(game.report.runs),
    status: "draft" as const,
  };

  return db.transaction(async (tx) => {
    let gameId = job.gameId;
    let versionNumber = 1;

    if (job.kind === "create") {
      const [created] = await tx
        .insert(schema.games)
        .values({
          slug: toSlug(game.title),
          gameKind: "code",
          type: null,
          title: game.title,
          description: game.summary || meta.hint,
          creatorId: job.profileId,
          status: "draft",
        })
        .returning({ id: schema.games.id });
      gameId = created!.id;
    } else {
      const [latest] = await tx
        .select({ n: sql<number>`coalesce(max(${schema.gameVersions.versionNumber}), 0)`.mapWith(Number) })
        .from(schema.gameVersions)
        .where(eq(schema.gameVersions.gameId, gameId!));
      versionNumber = (latest?.n ?? 0) + 1;
    }

    const [saved] = await tx
      .insert(schema.gameVersions)
      .values({ ...version, gameId: gameId!, versionNumber })
      .returning({ id: schema.gameVersions.id });

    // current_version_id is DEFERRABLE, so a new game can point at its first version here.
    await tx
      .update(schema.games)
      .set({ currentVersionId: saved!.id })
      .where(and(eq(schema.games.id, gameId!), eq(schema.games.status, "draft")));

    const [row] = await tx
      .update(schema.generationJobs)
      .set({
        status: "done",
        state: null,
        events,
        ...usage,
        gameId,
        resultVersionId: saved!.id,
        // Kept when the version failed its checks, so the studio can say why.
        problem: result.problem,
        finishedAt: sql`now()`,
      })
      .where(eq(schema.generationJobs.id, job.id))
      .returning();
    return toView(row!);
  });
}

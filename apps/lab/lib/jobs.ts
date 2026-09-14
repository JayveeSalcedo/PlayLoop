/**
 * AI create / change jobs for the lab. A job runs the pipeline in the
 * background (the dev server is long-lived) and the browser polls its
 * progress. Finished games are saved like pasted ones, with their game-lab
 * report, and every generation is logged with its tokens.
 *
 * Mirrors what the merge phase needs in apps/web: an ai_generations log that
 * doubles as the rate limiter, and a daily token budget.
 */
import { changeGame, configuredProviderId, createGame, getProvider, PROMPT_VERSION, type PipelineResult, type ProgressEvent } from "@playloop/ai";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { copySlotImages } from "./images";
import { addGame, getGame, saveReport } from "./lab";

const DATA_DIR = process.env.LAB_DATA_DIR ?? path.join(process.cwd(), ".data");
const GENERATIONS_FILE = path.join(DATA_DIR, "generations.jsonl");
/** Groq's free tier allows 200K tokens a day for the whole account; stop a bit before it. */
const DAILY_TOKEN_BUDGET = Number(process.env.LAB_DAILY_TOKEN_BUDGET ?? 180_000);
const MAX_IDEA_CHARS = 1_000;

export interface JobView {
  id: string;
  kind: "create" | "change";
  status: "running" | "done" | "failed";
  events: ProgressEvent[];
  startedAt: number;
  /** Set when a game was saved (it may still fail checks). */
  gameId: string | null;
  ok: boolean;
  problem: string | null;
  title: string | null;
  summary: string | null;
  notes: string | null;
  calls: number;
  tokens: number;
}

const g = globalThis as unknown as { __labJobs?: Map<string, JobView> };
const jobs = (g.__labJobs ??= new Map());

export function getJob(id: string): JobView | null {
  return jobs.get(id) ?? null;
}

export function providerLabel(): string {
  try {
    const provider = getProvider();
    return `${provider.id} · ${provider.model("create")}`;
  } catch {
    return `${safeProviderId()} (not configured)`;
  }
}

function safeProviderId() {
  try {
    return configuredProviderId();
  } catch {
    return "unknown";
  }
}

export async function tokensUsedToday(): Promise<number> {
  if (!existsSync(GENERATIONS_FILE)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return (await readFile(GENERATIONS_FILE, "utf8"))
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => {
      try {
        const entry = JSON.parse(line) as { at: string; tokens: number };
        return entry.at.startsWith(today) ? sum + entry.tokens : sum;
      } catch {
        return sum;
      }
    }, 0);
}

type StartResult = { ok: true; jobId: string } | { ok: false; status: number; detail: string };

export async function startCreateJob(idea: string): Promise<StartResult> {
  const text = String(idea ?? "").trim();
  if (!text) return { ok: false, status: 400, detail: "Describe the game you want first." };
  if (text.length > MAX_IDEA_CHARS) return { ok: false, status: 400, detail: `Keep the idea under ${MAX_IDEA_CHARS} characters.` };
  return start("create", text, (options) => createGame(text, options));
}

export async function startChangeJob(gameId: string, instruction: string): Promise<StartResult> {
  const text = String(instruction ?? "").trim();
  if (!text) return { ok: false, status: 400, detail: "Describe the change you want first." };
  if (text.length > MAX_IDEA_CHARS) return { ok: false, status: 400, detail: `Keep the request under ${MAX_IDEA_CHARS} characters.` };
  const game = await getGame(gameId);
  if (!game) return { ok: false, status: 404, detail: "That game doesn't exist." };
  return start("change", text, (options) => changeGame(game.code, text, options), gameId);
}

async function start(
  kind: JobView["kind"],
  request: string,
  run: (options: Parameters<typeof createGame>[1]) => Promise<PipelineResult>,
  sourceGameId?: string,
): Promise<StartResult> {
  let provider;
  try {
    provider = getProvider();
  } catch (e) {
    return { ok: false, status: 503, detail: e instanceof Error ? e.message : String(e) };
  }
  const used = await tokensUsedToday();
  if (used >= DAILY_TOKEN_BUDGET) {
    return { ok: false, status: 429, detail: `The AI has used today's budget (${used.toLocaleString("en-US")} tokens). Try again tomorrow.` };
  }

  const job: JobView = {
    id: randomUUID(),
    kind,
    status: "running",
    events: [],
    startedAt: Date.now(),
    gameId: null,
    ok: false,
    problem: null,
    title: null,
    summary: null,
    notes: null,
    calls: 0,
    tokens: 0,
  };
  jobs.set(job.id, job);

  void (async () => {
    let result: PipelineResult;
    try {
      result = await run({ provider, onProgress: (event) => job.events.push(event) });
    } catch (e) {
      job.status = "failed";
      job.problem = e instanceof Error ? e.message : String(e);
      return;
    }
    job.calls = result.attempts.length;
    job.tokens = result.usage.inputTokens + result.usage.outputTokens;
    job.ok = result.ok;
    job.problem = result.problem;

    if (result.game) {
      job.title = result.game.title;
      job.summary = result.game.summary;
      job.notes = result.game.notes;
      const saved = await addGame(result.game.code);
      if (saved.ok) {
        job.gameId = saved.id;
        const game = await getGame(saved.id);
        if (game) await saveReport(game, result.game.report);
        // A change keeps the creator's images for slots that still exist with the same shape.
        if (sourceGameId) await copySlotImages(sourceGameId, saved.id);
      } else if (!job.problem) {
        job.problem = saved.detail;
      }
    }
    job.status = job.gameId ? "done" : "failed";

    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(
      GENERATIONS_FILE,
      JSON.stringify({
        at: new Date().toISOString(),
        kind,
        request,
        sourceGameId: sourceGameId ?? null,
        provider: result.provider,
        models: [...new Set(result.attempts.map((a) => a.model))],
        promptVersion: PROMPT_VERSION,
        ok: result.ok,
        calls: result.attempts.length,
        tokens: job.tokens,
        durationMs: result.durationMs,
        gameId: job.gameId,
        problem: result.problem,
      }) + "\n",
      "utf8",
    );
  })();

  return { ok: true, jobId: job.id };
}

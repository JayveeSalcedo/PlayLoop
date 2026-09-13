/**
 * The lab's server side: games, play sessions and verification.
 *
 * Deliberately shaped like the real flow the merge phase will build into
 * apps/web (startPlay issues a seed → the client plays → submitPlay replays
 * and decides), but backed by files and memory instead of the database, and
 * paying nothing. See the plan's "Built in isolation" section.
 */
import { checkGame, inspectGame, verifyPlay, type LabReport, type VerifyResult } from "@playloop/replay";
import { fnv1a, TICKS_PER_SECOND, type GameMeta } from "@playloop/runtime";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CALIBRATION_PAYOUT, type PlayVerdict, type TamperKind } from "./shared";

export { CALIBRATION_PAYOUT, TAMPER_KINDS, type PlayVerdict, type TamperKind } from "./shared";

const DATA_DIR = process.env.LAB_DATA_DIR ?? path.join(process.cwd(), ".data");
const EXAMPLES_DIR = process.env.LAB_EXAMPLES_DIR ?? path.resolve(process.cwd(), "../../packages/runtime/examples");
const CUSTOM_DIR = path.join(DATA_DIR, "games");
const PLAYS_FILE = path.join(DATA_DIR, "plays.jsonl");
const REPORTS_DIR = path.join(DATA_DIR, "reports");

/** Timer granularity allowance for the "played faster than real time" check. */
const REAL_TIME_TOLERANCE_SECONDS = 0.5;
const SESSION_TTL_MS = 30 * 60 * 1000;

export interface LabGame {
  id: string;
  source: "example" | "custom";
  code: string;
  meta: GameMeta | null;
  /** Why the game can't load, when meta is null. */
  problem: string | null;
}

export interface LabSession {
  id: string;
  gameId: string;
  seed: string;
  startedAt: number;
  status: "started" | "submitting" | "done";
  submission?: { score: number; log: unknown };
  verdict?: PlayVerdict;
}

export interface PlayRecord {
  sessionId: string;
  gameId: string;
  title: string;
  at: string;
  claimedScore: number;
  verdict: PlayVerdict;
}

// ---------------------------------------------------------------- games ----

const g = globalThis as unknown as {
  __labMetaCache?: Map<string, { meta: GameMeta | null; problem: string | null }>;
  __labSessions?: Map<string, LabSession>;
};
const metaCache = (g.__labMetaCache ??= new Map());
const sessions = (g.__labSessions ??= new Map());

async function describe(code: string) {
  const key = fnv1a(code) + ":" + code.length;
  const cached = metaCache.get(key);
  if (cached) return cached;
  const result = await inspectGame(code);
  const entry = result.ok ? { meta: result.meta, problem: null } : { meta: null, problem: `${result.reason}: ${result.detail}` };
  metaCache.set(key, entry);
  return entry;
}

async function readGameFiles(dir: string, source: LabGame["source"]): Promise<LabGame[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js")).sort();
  return Promise.all(
    files.map(async (file) => {
      const code = await readFile(path.join(dir, file), "utf8");
      const id = `${source}-${file.replace(/\.js$/, "")}`;
      return { id, source, code, ...(await describe(code)) };
    }),
  );
}

export async function listGames(): Promise<LabGame[]> {
  const [examples, custom] = await Promise.all([readGameFiles(EXAMPLES_DIR, "example"), readGameFiles(CUSTOM_DIR, "custom")]);
  return [...custom.reverse(), ...examples];
}

export async function getGame(id: string): Promise<LabGame | null> {
  return (await listGames()).find((game) => game.id === id) ?? null;
}

export async function addGame(code: string): Promise<{ ok: true; id: string } | { ok: false; detail: string }> {
  if (typeof code !== "string" || code.trim().length === 0) return { ok: false, detail: "Paste some game code first." };
  const described = await describe(code);
  if (!described.meta) return { ok: false, detail: described.problem ?? "The game couldn't load." };
  await mkdir(CUSTOM_DIR, { recursive: true });
  const name = `${Date.now().toString(36)}-${fnv1a(code)}`;
  await writeFile(path.join(CUSTOM_DIR, `${name}.js`), code, "utf8");
  return { ok: true, id: `custom-${name}` };
}

// -------------------------------------------------------------- reports ----

const labG = globalThis as unknown as { __labReportRuns?: Map<string, Promise<LabReport>> };
/** In-flight checks by code hash, so two requests for the same game share one run. */
const reportRuns = (labG.__labReportRuns ??= new Map());

const reportFile = (game: LabGame) => path.join(REPORTS_DIR, `${fnv1a(game.code)}-${game.code.length}.json`);

/** The saved report for this exact code, if checks have run. */
export async function cachedReport(game: LabGame): Promise<LabReport | null> {
  const file = reportFile(game);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as LabReport;
  } catch {
    return null;
  }
}

/** Stores a report computed elsewhere (the AI pipeline already checked the game), so it isn't re-run. */
export async function saveReport(game: LabGame, report: LabReport): Promise<void> {
  if (report.codeHash !== fnv1a(game.code)) return;
  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(reportFile(game), JSON.stringify(report, null, 2), "utf8");
}

/** Runs the game lab checks (or returns the saved report). Reports are keyed by code, so editing a game re-checks it. */
export async function reportFor(game: LabGame, options: { rerun?: boolean } = {}): Promise<LabReport> {
  if (!options.rerun) {
    const saved = await cachedReport(game);
    if (saved) return saved;
  }
  const file = reportFile(game);
  const running = reportRuns.get(file);
  if (running) return running;
  const run = (async () => {
    const report = await checkGame(game.code);
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(report, null, 2), "utf8");
    return report;
  })().finally(() => reportRuns.delete(file));
  reportRuns.set(file, run);
  return run;
}

// ------------------------------------------------------------- sessions ----

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.startedAt < cutoff) sessions.delete(id);
}

/** startPlay: the server, not the client, picks the seed. */
export async function startSession(gameId: string): Promise<{ ok: true; sessionId: string; seed: string } | { ok: false; detail: string }> {
  pruneSessions();
  const game = await getGame(gameId);
  if (!game?.meta) return { ok: false, detail: "That game doesn't exist or can't load." };
  const session: LabSession = { id: randomUUID(), gameId, seed: randomBytes(16).toString("hex"), startedAt: Date.now(), status: "started" };
  sessions.set(session.id, session);
  return { ok: true, sessionId: session.id, seed: session.seed };
}

/**
 * submitPlay: single use per session. The score that counts is the replay's;
 * the client's claim is only compared against it.
 */
export async function submitSession(
  sessionId: string,
  body: { score?: unknown; log?: unknown },
): Promise<{ ok: true; verdict: PlayVerdict } | { ok: false; status: number; detail: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, status: 404, detail: "That play session doesn't exist or expired." };
  if (session.status !== "started") return { ok: false, status: 409, detail: "This play session was already submitted." };
  if (typeof body.score !== "number" || !Number.isInteger(body.score) || body.score < 0) {
    return { ok: false, status: 400, detail: "score must be a non-negative integer." };
  }
  const game = await getGame(session.gameId);
  if (!game?.meta) return { ok: false, status: 410, detail: "The game is gone." };

  session.status = "submitting";
  const claimedScore = body.score;
  session.submission = { score: claimedScore, log: body.log };
  const verdict = await decide(game, session, claimedScore, body.log);
  session.status = "done";
  session.verdict = verdict;

  await record({ sessionId, gameId: game.id, title: game.meta.title, at: new Date().toISOString(), claimedScore, verdict });
  return { ok: true, verdict };
}

async function decide(game: LabGame, session: LabSession, claimedScore: number, log: unknown, seed = session.seed): Promise<PlayVerdict> {
  const elapsedSeconds = (Date.now() - session.startedAt) / 1000;
  const ticks = (log as { ticks?: unknown } | null)?.ticks;

  // Game time can never run ahead of real time in the browser host, so a log
  // claiming more ticks than wall-clock seconds allow was fabricated.
  if (typeof ticks === "number" && elapsedSeconds + REAL_TIME_TOLERANCE_SECONDS < ticks / TICKS_PER_SECOND) {
    return {
      ok: false,
      reason: "too_fast",
      detail: `The log covers ${(ticks / TICKS_PER_SECOND).toFixed(1)} s of play, but only ${elapsedSeconds.toFixed(1)} s passed since the session started.`,
      claimedScore,
      verifyMs: 0,
      elapsedSeconds,
    };
  }

  let result: VerifyResult;
  try {
    result = await verifyPlay({ code: game.code, seed, log: JSON.stringify(log ?? null), claimedScore });
  } catch (e) {
    result = { ok: false, reason: "runtime_error", detail: e instanceof Error ? e.message : String(e), elapsedMs: 0 };
  }
  if (result.ok) {
    return { ok: true, score: result.score, ticks: result.ticks, endReason: result.endReason, verifyMs: result.elapsedMs, elapsedSeconds, payoutPreview: CALIBRATION_PAYOUT };
  }
  return {
    ok: false,
    reason: result.reason,
    detail: result.detail,
    claimedScore,
    replayScore: result.replayScore,
    tick: result.tick,
    verifyMs: result.elapsedMs,
    elapsedSeconds,
  };
}

/**
 * Re-runs this session's real submission with one thing forged, to show the
 * verifier catching it. Lab-only; nothing is recorded or changed.
 */
export async function tamperSession(sessionId: string, kind: TamperKind): Promise<{ ok: true; verdict: PlayVerdict } | { ok: false; status: number; detail: string }> {
  const session = sessions.get(sessionId);
  if (!session?.submission) return { ok: false, status: 404, detail: "Finish and submit a play first." };
  const game = await getGame(session.gameId);
  if (!game) return { ok: false, status: 410, detail: "The game is gone." };

  const log = session.submission.log as { v: number; ticks: number; events: number[] };
  const claimed = session.submission.score;
  switch (kind) {
    case "inflate-score":
      return { ok: true, verdict: await decide(game, session, claimed + 100, log) };
    case "idle-inputs":
      return { ok: true, verdict: await decide(game, session, claimed, { ...log, events: [] }) };
    case "different-seed":
      return { ok: true, verdict: await decide(game, session, claimed, log, randomBytes(16).toString("hex")) };
    case "fewer-ticks":
      return { ok: true, verdict: await decide(game, session, claimed, { ...log, ticks: Math.max(1, log.ticks - 5 * TICKS_PER_SECOND) }) };
  }
}

/** Test hook: pretend a session started `seconds` ago, so bot plays (which run instantly) pass the real-time check. */
export function backdateSessionForTests(sessionId: string, seconds: number) {
  const session = sessions.get(sessionId);
  if (session) session.startedAt -= seconds * 1000;
}

// ---------------------------------------------------------------- plays ----

async function record(play: PlayRecord) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(PLAYS_FILE, JSON.stringify(play) + "\n", "utf8");
}

export async function recentPlays(limit = 15): Promise<PlayRecord[]> {
  if (!existsSync(PLAYS_FILE)) return [];
  const lines = (await readFile(PLAYS_FILE, "utf8")).trim().split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .reverse()
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as PlayRecord];
      } catch {
        return [];
      }
    });
}

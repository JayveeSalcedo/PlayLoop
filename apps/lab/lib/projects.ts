/**
 * Studio projects: one creator's game in progress, across versions.
 *
 * A project points at lab games (one per version), so every version keeps its
 * own code, check report and images, and "undo" is just choosing an earlier
 * version. Stored as JSON under .data/projects/. In the merge phase this maps
 * to games + game_versions rows.
 */
import { fnv1a } from "@playloop/runtime";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listSlotImages } from "./images";
import { getJob, startChangeJob, startCreateJob } from "./jobs";
import { addGame, cachedReport, getGame, getSession, reportFor, type LabGame } from "./lab";

const DATA_DIR = process.env.LAB_DATA_DIR ?? path.join(process.cwd(), ".data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SAFE_ID = /^[a-f0-9-]{36}$/;

export type VersionVia = "template" | "ai-create" | "ai-change" | "ai-fix";

export interface ProjectVersion {
  n: number;
  gameId: string;
  via: VersionVia;
  /** The idea, change request, or template name that produced it. */
  request: string;
  title: string;
  summary: string;
  notes: string;
  createdAt: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  origin: { kind: "idea"; idea: string } | { kind: "template"; templateId: string };
  versions: ProjectVersion[];
  current: number | null;
  /** An AI job currently producing the next version. */
  pendingJobId: string | null;
  /** The last verified test play, and which version it was for. */
  testPlay: { gameId: string; sessionId: string; ok: boolean; score: number | null; reason: string | null; at: string } | null;
  submittedAt: string | null;
}

const file = (id: string) => path.join(PROJECTS_DIR, `${id}.json`);

// Serialize writes per project: a finishing AI job and a click can land together.
const g = globalThis as unknown as { __labProjectLocks?: Map<string, Promise<unknown>> };
const locks = (g.__labProjectLocks ??= new Map());

async function update<T>(id: string, fn: (project: Project) => T | Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.then(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("That project doesn't exist.");
    const result = await fn(project);
    project.updatedAt = new Date().toISOString();
    await writeFile(file(id), JSON.stringify(project, null, 2), "utf8");
    return result;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!SAFE_ID.test(id) || !existsSync(file(id))) return null;
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as Project;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<Project[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const all = await Promise.all(
    (await readdir(PROJECTS_DIR)).filter((f) => f.endsWith(".json")).map((f) => getProject(f.replace(/\.json$/, ""))),
  );
  return all.filter((p): p is Project => Boolean(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function currentVersion(project: Project): ProjectVersion | null {
  return project.versions.find((v) => v.n === project.current) ?? null;
}

async function create(origin: Project["origin"]): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = { id: randomUUID(), createdAt: now, updatedAt: now, origin, versions: [], current: null, pendingJobId: null, testPlay: null, submittedAt: null };
  await mkdir(PROJECTS_DIR, { recursive: true });
  await writeFile(file(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

async function addVersion(id: string, version: Omit<ProjectVersion, "n" | "createdAt">) {
  await update(id, (p) => {
    const n = (p.versions.at(-1)?.n ?? 0) + 1;
    p.versions.push({ ...version, n, createdAt: new Date().toISOString() });
    p.current = n;
    p.pendingJobId = null;
    p.submittedAt = null;
  });
}

type Started = { ok: true; projectId: string; jobId: string | null } | { ok: false; status: number; detail: string };

/** A new project from an idea: the AI job's game becomes version 1. */
export async function startFromIdea(idea: string): Promise<Started> {
  const text = String(idea ?? "").trim();
  if (!text) return { ok: false, status: 400, detail: "Describe the game you want first." };
  const project = await create({ kind: "idea", idea: text });
  const job = await startCreateJob(text, (saved) =>
    addVersion(project.id, { gameId: saved.gameId, via: "ai-create", request: text, title: saved.title, summary: saved.summary, notes: saved.notes }),
  );
  if (!job.ok) return job;
  await update(project.id, (p) => void (p.pendingJobId = job.jobId));
  return { ok: true, projectId: project.id, jobId: job.jobId };
}

/** A new project from an example game: its own copy, so images and changes don't touch the example. */
export async function startFromTemplate(templateId: string): Promise<Started> {
  const template = await getGame(String(templateId ?? ""));
  if (!template?.meta || template.source !== "example") return { ok: false, status: 404, detail: "That template doesn't exist." };
  const copy = await addGame(template.code);
  if (!copy.ok) return { ok: false, status: 422, detail: copy.detail };
  const project = await create({ kind: "template", templateId: template.id });
  await addVersion(project.id, { gameId: copy.id, via: "template", request: template.meta.title, title: template.meta.title, summary: template.meta.hint, notes: "" });
  return { ok: true, projectId: project.id, jobId: null };
}

/** Ask the AI for a change (or to fix what the checks found); the result becomes a new version. */
export async function requestChange(projectId: string, input: { instruction?: string; fix?: boolean }): Promise<Started> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, status: 404, detail: "That project doesn't exist." };
  if (project.pendingJobId) return { ok: false, status: 409, detail: "The AI is still working on the last request." };
  const version = currentVersion(project);
  if (!version) return { ok: false, status: 409, detail: "This project has no game yet." };

  let instruction = String(input.instruction ?? "").trim();
  let via: VersionVia = "ai-change";
  if (input.fix) {
    const game = await getGame(version.gameId);
    const report = game ? await cachedReport(game) : null;
    if (!report?.fixPrompt) return { ok: false, status: 409, detail: "The checks didn't find anything to fix." };
    instruction = report.fixPrompt;
    via = "ai-fix";
  }
  if (!instruction) return { ok: false, status: 400, detail: "Describe the change you want first." };

  const job = await startChangeJob(version.gameId, instruction, (saved) =>
    addVersion(projectId, {
      gameId: saved.gameId,
      via,
      request: via === "ai-fix" ? "Fix what the checks found" : instruction,
      title: saved.title,
      summary: saved.summary,
      notes: saved.notes,
    }),
  );
  if (!job.ok) return job;
  await update(projectId, (p) => void (p.pendingJobId = job.jobId));
  return { ok: true, projectId, jobId: job.jobId };
}

/**
 * Clears a pending job that is no longer running (it failed without a game,
 * or the dev server restarted and forgot it). Successful jobs already cleared
 * it when they added their version.
 */
export async function settlePendingJob(project: Project): Promise<Project> {
  if (!project.pendingJobId) return project;
  const job = getJob(project.pendingJobId);
  if (job?.status === "running") return project;
  await update(project.id, (p) => {
    if (p.pendingJobId === project.pendingJobId) p.pendingJobId = null;
  });
  return (await getProject(project.id)) ?? project;
}

/** Undo / redo: make an existing version current. */
export async function useVersion(projectId: string, n: number): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, status: 404, detail: "That project doesn't exist." };
  if (!project.versions.some((v) => v.n === n)) return { ok: false, status: 404, detail: "That version doesn't exist." };
  await update(projectId, (p) => {
    p.current = n;
    p.submittedAt = null;
  });
  return { ok: true };
}

/**
 * Records a test play from the server's own session store (never from what
 * the browser says): the session must be for this project's current version.
 */
export async function recordTestPlay(projectId: string, sessionId: string): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const project = await getProject(projectId);
  const version = project ? currentVersion(project) : null;
  if (!project || !version) return { ok: false, status: 404, detail: "That project doesn't exist." };
  const session = getSession(String(sessionId ?? ""));
  if (!session?.verdict) return { ok: false, status: 409, detail: "That play hasn't been verified yet." };
  if (session.gameId !== version.gameId) return { ok: false, status: 409, detail: "That play was for a different version of the game." };
  const verdict = session.verdict;
  await update(projectId, (p) => {
    p.testPlay = {
      gameId: session.gameId,
      sessionId: session.id,
      ok: verdict.ok,
      score: verdict.ok ? verdict.score : null,
      reason: verdict.ok ? null : verdict.reason,
      at: new Date().toISOString(),
    };
  });
  return { ok: true };
}

export interface PublishReadiness {
  checksPassed: boolean;
  checksRun: boolean;
  testedCurrent: boolean;
  imagesAdded: number;
  imageSlots: number;
  ready: boolean;
}

export async function readiness(project: Project, game: LabGame | null): Promise<PublishReadiness> {
  const report = game ? await cachedReport(game) : null;
  const slots = game?.meta?.imageSlots?.length ?? 0;
  const images = game ? (await listSlotImages(game.id)).filter((i) => game.meta?.imageSlots?.some((s) => s.id === i.slotId)).length : 0;
  const checksPassed = report?.verdict === "pass";
  const testedCurrent = Boolean(project.testPlay?.ok && project.testPlay.gameId === game?.id);
  return { checksPassed, checksRun: Boolean(report), testedCurrent, imagesAdded: images, imageSlots: slots, ready: checksPassed && testedCurrent };
}

export async function submitProject(projectId: string): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const project = await getProject(projectId);
  const version = project ? currentVersion(project) : null;
  if (!project || !version) return { ok: false, status: 404, detail: "That project doesn't exist." };
  const game = await getGame(version.gameId);
  if (game) await reportFor(game);
  const ready = await readiness(project, game);
  if (!ready.checksPassed) return { ok: false, status: 409, detail: "The current version has to pass every check first." };
  if (!ready.testedCurrent) return { ok: false, status: 409, detail: "Play the current version once so the server can verify it." };
  await update(projectId, (p) => void (p.submittedAt = new Date().toISOString()));
  return { ok: true };
}

/** Stable short label for a project in lists. */
export function projectLabel(project: Project): string {
  return currentVersion(project)?.title ?? (project.origin.kind === "idea" ? project.origin.idea.slice(0, 60) : `Project ${fnv1a(project.id).slice(0, 4)}`);
}

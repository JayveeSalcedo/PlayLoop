import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { playWithBot } from "../../../packages/runtime/test/realm";

const dataDir = mkdtempSync(path.join(tmpdir(), "playloop-lab-projects-"));
process.env.LAB_DATA_DIR = dataDir;
process.env.LAB_EXAMPLES_DIR = path.resolve(__dirname, "../../../packages/runtime/examples");
const lab = await import("../lib/lab");
const projects = await import("../lib/projects");

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

/** Plays a project's current version with a bot and verifies it through the real session flow. */
async function verifiedPlay(gameId: string, botSeed: number) {
  const game = (await lab.getGame(gameId))!;
  const started = await lab.startSession(gameId);
  if (!started.ok) throw new Error(started.detail);
  const play = playWithBot(game.code, started.seed, botSeed);
  lab.backdateSessionForTests(started.sessionId, play.ticks / 60 + 3);
  const submitted = await lab.submitSession(started.sessionId, { score: play.score, log: play.log });
  if (!submitted.ok) throw new Error(submitted.detail);
  return started.sessionId;
}

describe("studio projects", () => {
  it("starts from an example as a private copy, so images and changes don't touch the example", async () => {
    const started = await projects.startFromTemplate("example-catch");
    if (!started.ok) throw new Error(started.detail);
    const project = (await projects.getProject(started.projectId))!;
    expect(project.versions).toHaveLength(1);
    const v1 = projects.currentVersion(project)!;
    expect(v1).toMatchObject({ n: 1, via: "template", title: "Catch and Collect" });
    expect(v1.gameId).toMatch(/^custom-/);
    expect(await projects.startFromTemplate("custom-nope")).toMatchObject({ ok: false, status: 404 });
  });

  it("only publishes a version that passes checks and was verified by a real test play of that version", async () => {
    const started = await projects.startFromTemplate("example-desert-dash");
    if (!started.ok) throw new Error(started.detail);
    const id = started.projectId;
    const gameId = projects.currentVersion((await projects.getProject(id))!)!.gameId;

    // Not tested yet.
    expect(await projects.submitProject(id)).toMatchObject({ ok: false, status: 409, detail: expect.stringMatching(/Play the current version/) });

    // A session that was never submitted doesn't count.
    const unverified = await lab.startSession(gameId);
    if (!unverified.ok) throw new Error(unverified.detail);
    expect(await projects.recordTestPlay(id, unverified.sessionId)).toMatchObject({ ok: false, status: 409 });

    // A verified play of a different game doesn't count.
    const other = await verifiedPlay("example-catch", 5);
    expect(await projects.recordTestPlay(id, other)).toMatchObject({ ok: false, detail: expect.stringMatching(/different version/) });

    // A verified play of this version does.
    expect(await projects.recordTestPlay(id, await verifiedPlay(gameId, 6))).toEqual({ ok: true });
    expect(await projects.submitProject(id)).toEqual({ ok: true });
    expect((await projects.getProject(id))!.submittedAt).not.toBeNull();
  }, 120_000);

  it("switching version un-submits and requires a new test play", async () => {
    const started = await projects.startFromTemplate("example-brand-pop");
    if (!started.ok) throw new Error(started.detail);
    const id = started.projectId;
    const v1 = projects.currentVersion((await projects.getProject(id))!)!;
    await projects.recordTestPlay(id, await verifiedPlay(v1.gameId, 7));

    // Simulate a second version (what an AI change adds) by attaching another copy.
    const copy = await lab.addGame((await lab.getGame(v1.gameId))!.code.replace("Brand Pop", "Brand Pop Two"));
    if (!copy.ok) throw new Error(copy.detail);
    const project = (await projects.getProject(id))!;
    project.versions.push({ ...v1, n: 2, gameId: copy.id, via: "ai-change", request: "rename", title: "Brand Pop Two" });
    project.current = 2;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dataDir, "projects", `${id}.json`), JSON.stringify(project));

    const game2 = await lab.getGame(copy.id);
    await lab.reportFor(game2!);
    expect((await projects.readiness((await projects.getProject(id))!, game2)).testedCurrent).toBe(false);

    expect(await projects.useVersion(id, 1)).toEqual({ ok: true });
    const back = (await projects.getProject(id))!;
    expect(back.current).toBe(1);
    expect((await projects.readiness(back, await lab.getGame(v1.gameId))).testedCurrent).toBe(true);
    expect(await projects.useVersion(id, 9)).toMatchObject({ ok: false, status: 404 });
  }, 120_000);

  it("won't ask the AI for a change while one is running, or fix when nothing failed", async () => {
    const started = await projects.startFromTemplate("example-catch");
    if (!started.ok) throw new Error(started.detail);
    const id = started.projectId;
    const game = await lab.getGame(projects.currentVersion((await projects.getProject(id))!)!.gameId);
    await lab.reportFor(game!);
    expect(await projects.requestChange(id, { fix: true })).toMatchObject({ ok: false, detail: expect.stringMatching(/didn't find anything/) });
    expect(await projects.requestChange(id, { instruction: "  " })).toMatchObject({ ok: false, status: 400 });
  }, 60_000);
});

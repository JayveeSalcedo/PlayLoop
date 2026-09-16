/**
 * Integration check of AI generation jobs against the real database and the
 * real game lab, with a scripted AI provider standing in for the model — so it
 * exercises the job engine (claiming, one round per step, saved state, versions,
 * drafts, stale heartbeats, ownership) without spending provider tokens.
 *
 *   cd apps/web
 *   ../../packages/db/node_modules/.bin/tsx scripts/e2e-generation-jobs.mts
 *
 * Calls lib/generation/jobs.ts directly rather than over HTTP: the routes are
 * thin wrappers around it, and the part worth proving is what happens in the
 * database across steps.
 *
 * WRITES TO THE DATABASE IN .env: two test profiles
 * (e2e-code-play@playloop.invalid, e2e-code-play-2@playloop.invalid), their
 * generation jobs, and a few draft/rejected code games. Nothing it creates is
 * published.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import type { AiProvider, GenerateRequest } from "@playloop/ai";
import { getDb, schema } from "@playloop/db";
import { and, eq, sql } from "drizzle-orm";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });
// createJob refuses when no provider is configured. The provider is scripted
// below, so a placeholder key is enough to get past that check; it's never sent.
process.env.AI_PROVIDER = "groq";
process.env.GROQ_API_KEY ||= "scripted-provider-no-network";

const { createJob, getJob, stepJob } = await import("../lib/generation/jobs.ts");

const db = getDb();
const failures: string[] = [];
function expect(what: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(what);
}

const GOOD = readFileSync(path.resolve(here, "../../../packages/runtime/examples/desert-dash.js"), "utf8");
// Loads fine, then crashes on its first update: fails the lab's checks with a fix prompt.
const BROKEN = GOOD.replace("update(", "update(__s, __i, __c) { Math.random(); return this.__real(__s, __i, __c); }, __real(");
const CHANGED = GOOD.replace(/title:\s*"Desert Dash"/, 'title: "Desert Dash Turbo"');

/** A provider that answers from a script and records every request. */
function scripted(answers: string[]): AiProvider & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  return {
    id: "groq",
    requests,
    capabilities: { strictJson: true, tokensPerMinute: null, maxOutputTokens: 6000, pricePerMillion: null },
    model: () => "scripted",
    async generate(request) {
      requests.push(request);
      const code = answers.shift();
      if (code === undefined) throw new Error("scripted provider ran out of answers");
      return { json: { title: "Scripted game", summary: "A test game", code, notes: "" }, model: "scripted", usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 1 };
    },
  };
}

async function testProfile(email: string) {
  const [existing] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email));
  if (existing) return existing;
  const [created] = await db.insert(schema.profiles).values({ email, name: "E2E", onboardedAt: new Date() }).returning();
  return created!;
}

/** Steps a job until it ends, like the studio does. */
async function drive(jobId: string, profileId: string, provider: AiProvider) {
  let steps = 0;
  for (;;) {
    const job = await stepJob(jobId, profileId, { provider });
    steps += 1;
    if (!job || job.status === "done" || job.status === "failed") return { job, steps };
    if (steps > 10) throw new Error("job never ended");
  }
}

const version = (id: string) => db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, id)).then((r) => r[0]!);
const gameRow = (id: string) => db.select().from(schema.games).where(eq(schema.games.id, id)).then((r) => r[0]!);

const me = await testProfile("e2e-code-play@playloop.invalid");
const other = await testProfile("e2e-code-play-2@playloop.invalid");

// A previous interrupted run could leave an open job blocking the one-at-a-time limit.
await db
  .update(schema.generationJobs)
  .set({ status: "failed", state: null, problem: "e2e cleanup", finishedAt: sql`now()` })
  .where(and(sql`${schema.generationJobs.profileId} in (${me.id}, ${other.id})`, sql`${schema.generationJobs.status} in ('queued', 'running')`));

console.log("\n1. a create job runs one round per step and ends as a draft game");
const provider1 = scripted([BROKEN, GOOD]);
const started = await createJob({ profileId: me.id, kind: "create", request: "a desert runner game" });
expect("job created and queued", started.ok && started.job.status === "queued", started.ok ? "" : started.error);
if (!started.ok) process.exit(1);
const jobId = started.job.id;

const second = await createJob({ profileId: me.id, kind: "create", request: "another one" });
expect("a second job while one is open is refused", !second.ok && second.status === 409, second.ok ? "accepted" : String(second.status));

const afterOne = await stepJob(jobId, me.id, { provider: provider1 });
const [savedRow] = await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, jobId));
expect("after one step the job is queued again, not done", afterOne?.status === "queued", afterOne?.status);
expect("the round's progress was saved", (afterOne?.events.length ?? 0) >= 2 && afterOne!.calls === 1);
expect("the pipeline state was saved for the next step", !!savedRow?.state && (savedRow.state as { round?: number }).round === 1);

const { job: done } = await drive(jobId, me.id, provider1);
expect("second step finished the job", done?.status === "done", `${done?.status} ${done?.problem ?? ""}`);
expect("exactly two model calls across both steps", provider1.requests.length === 2 && done!.calls === 2);
expect("the fix round got the lab's feedback", provider1.requests[1]!.task === "fix" && provider1.requests[1]!.messages[0]!.content.includes("Math.random"));

const g = await gameRow(done!.gameId!);
const v1 = await version(done!.resultVersionId!);
expect("created a draft code game owned by the creator", g.status === "draft" && g.gameKind === "code" && g.type === null && g.creatorId === me.id);
expect("the game's current version is v1", g.currentVersionId === v1.id && v1.versionNumber === 1);
expect("v1 passed its checks and recorded its runtime", v1.validation === "pass" && v1.runtimeVersion >= 1 && v1.via === "ai-create");
expect("v1 has a score target from its bot runs", typeof v1.scoreTarget === "number" && v1.scoreTarget > 0, String(v1.scoreTarget));
expect("saved state cleared once the job ended", !(await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, jobId)))[0]!.state);
const inQueue = await db.select().from(schema.games).where(and(eq(schema.games.id, g.id), eq(schema.games.status, "pending_review")));
expect("the draft isn't in the moderation queue", inQueue.length === 0);

console.log("\n2. two steps racing on one job run only one round");
{
  const provider = scripted([GOOD, GOOD]);
  const job = await createJob({ profileId: me.id, kind: "change", versionId: v1.id, request: "make it harder" });
  if (!job.ok) throw new Error(job.error);
  await Promise.all([stepJob(job.job.id, me.id, { provider }), stepJob(job.job.id, me.id, { provider })]);
  expect("one model call, not two", provider.requests.length === 1, String(provider.requests.length));
  const end = await getJob(job.job.id, me.id);
  expect("and the job finished once", end?.status === "done");
}

console.log("\n3. a change makes the next version and leaves earlier ones alone");
{
  const before = await version(v1.id);
  const provider = scripted([CHANGED]);
  const job = await createJob({ profileId: me.id, kind: "change", versionId: v1.id, request: "call it Turbo" });
  if (!job.ok) throw new Error(job.error);
  expect("the change request carries the current code", true);
  const { job: end } = await drive(job.job.id, me.id, provider);
  const next = await version(end!.resultVersionId!);
  expect("a new version was added", next.versionNumber >= 3 && next.via === "ai-change", `v${next.versionNumber}`);
  expect("the change request was sent with v1's code", provider.requests[0]!.task === "change" && provider.requests[0]!.messages[0]!.content.includes("Desert Dash"));
  const after = await version(v1.id);
  expect("v1 is byte-for-byte unchanged", after.code === before.code && after.contentHash === before.contentHash && after.runtimeVersion === before.runtimeVersion);
  expect("on a draft, the newest version becomes current", (await gameRow(g.id)).currentVersionId === next.id);
}

console.log("\n4. a failing version can be fixed from its own lab feedback");
{
  const provider = scripted([BROKEN, BROKEN, BROKEN]);
  const job = await createJob({ profileId: me.id, kind: "create", request: "a broken game" });
  if (!job.ok) throw new Error(job.error);
  const { job: end, steps } = await drive(job.job.id, me.id, provider);
  const failed = await version(end!.resultVersionId!);
  expect("three rounds, one per step", steps === 3 && provider.requests.length === 3, `${steps} steps`);
  expect("kept as a failing version so it can be fixed", end?.status === "done" && failed.validation === "fail" && !!end.problem);

  const fixer = scripted([GOOD]);
  const fix = await createJob({ profileId: me.id, kind: "fix", versionId: failed.id });
  if (!fix.ok) throw new Error(fix.error);
  const { job: fixed } = await drive(fix.job.id, me.id, fixer);
  const repaired = await version(fixed!.resultVersionId!);
  const fixPrompt = (failed.report as { fixPrompt?: string }).fixPrompt ?? "";
  expect("the fix sent that version's lab feedback", fixPrompt.length > 0 && fixer.requests[0]!.messages[0]!.content.includes(fixPrompt.slice(0, 40)));
  expect("the fixed version passes", repaired.via === "ai-fix" && repaired.validation === "pass");
}

console.log("\n5. a step whose invocation died doesn't leave the job stuck");
{
  const job = await createJob({ profileId: me.id, kind: "create", request: "a game whose step dies" });
  if (!job.ok) throw new Error(job.error);
  // What a killed invocation leaves behind: running, with a heartbeat nobody refreshes.
  await db.update(schema.generationJobs).set({ status: "running", heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(schema.generationJobs.id, job.job.id));
  const seen = await getJob(job.job.id, me.id);
  expect("the next read marks it failed", seen?.status === "failed" && /stopped responding/.test(seen.problem ?? ""), `${seen?.status} ${seen?.problem}`);
  const again = await createJob({ profileId: me.id, kind: "create", request: "try again" });
  expect("and the creator can start a new one", again.ok);
  if (again.ok) await db.update(schema.generationJobs).set({ status: "failed", state: null, problem: "e2e cleanup" }).where(eq(schema.generationJobs.id, again.job.id));
}

console.log("\n6. nobody can change someone else's version");
{
  const theirs = await createJob({ profileId: other.id, kind: "change", versionId: v1.id, request: "steal it" });
  expect("refused as not found", !theirs.ok && theirs.status === 404, theirs.ok ? "accepted" : String(theirs.status));
  const peek = await getJob(jobId, other.id);
  expect("and can't read another creator's job", peek === null);
}

console.log("\n7. a change to a game that's been submitted doesn't move what players get");
{
  const current = (await gameRow(g.id)).currentVersionId;
  // 'rejected' rather than 'published' so the test game never appears in the feed;
  // the rule is the same for every non-draft status.
  await db.update(schema.games).set({ status: "rejected" }).where(eq(schema.games.id, g.id));
  const provider = scripted([GOOD]);
  const job = await createJob({ profileId: me.id, kind: "change", versionId: current!, request: "tweak" });
  if (!job.ok) throw new Error(job.error);
  const { job: end } = await drive(job.job.id, me.id, provider);
  expect("the new version was stored", end?.status === "done" && !!end.resultVersionId);
  expect("but current still points at the old version", (await gameRow(g.id)).currentVersionId === current);
}

console.log(failures.length === 0 ? "\nAll generation job checks passed.\n" : `\n${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
process.exit(failures.length === 0 ? 0 : 1);

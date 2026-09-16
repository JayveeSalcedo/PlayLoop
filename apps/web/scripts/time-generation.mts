/**
 * Runs one real AI generation through the production job routes and reports how
 * long each round (each step request) took. That number is what decides whether
 * a hosting plan's function time limit is enough: a single round — one model
 * call plus the game lab's checks — can't be split any further.
 *
 *   cd apps/web
 *   (start a server whose env has an AI key, and ADMIN_EMAILS including the test profile)
 *   ../../packages/db/node_modules/.bin/tsx scripts/time-generation.mts http://localhost:3301 "<idea>"
 *
 * Uses the test profile e2e-code-play@playloop.invalid. Spends real provider
 * tokens and writes a generation job and a draft game.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const [base, idea] = process.argv.slice(2);
if (!base || !idea) {
  console.error('usage: tsx scripts/time-generation.mts <base-url> "<idea>"');
  process.exit(1);
}

const db = getDb();
const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, "e2e-code-play@playloop.invalid"));
if (!profile) throw new Error("Run e2e-code-play.mts first to create the test profile.");
const cookie = `pl_session=${await new SignJWT({ email: profile.email })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(profile.id)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET!))}`;

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> };
}

const created = await call("POST", "/api/studio/jobs", { kind: "create", request: idea });
if (created.status !== 201) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.json)}`);
const jobId = created.json.id as string;
console.log(`Job ${jobId} for: ${idea}\n`);

const overall = Date.now();
let job = created.json;
let step = 0;
let seenEvents = 0;
while (job.status === "queued" || job.status === "running") {
  step += 1;
  const at = Date.now();
  const r = await call("POST", `/api/studio/jobs/${jobId}/step`);
  const ms = Date.now() - at;
  job = r.json;
  for (const e of (job.events ?? []).slice(seenEvents)) console.log(`    ${e.step.padEnd(8)} ${e.message}`);
  seenEvents = job.events?.length ?? 0;
  console.log(`  step ${step}: ${(ms / 1000).toFixed(1)} s → ${job.status} (http ${r.status})\n`);
  if (r.status !== 200 || step > 6) break;
}

console.log(`Status: ${job.status}. ${job.calls} model call(s), ${job.tokens} tokens, ${((Date.now() - overall) / 1000).toFixed(1)} s total.`);
if (job.problem) console.log(`Problem: ${job.problem}`);
if (job.resultVersionId) {
  const [v] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, job.resultVersionId));
  const report = v!.report as { checks?: { title: string; status: string; summary: string }[] } | null;
  console.log(`\nVersion ${v!.versionNumber}: "${v!.title}" — validation ${v!.validation}, score target ${v!.scoreTarget}, runtime ${v!.runtimeVersion}, model ${v!.model}`);
  for (const c of report?.checks ?? []) console.log(`  ${c.status.padEnd(4)} ${c.title}: ${c.summary}`);
}
process.exit(0);

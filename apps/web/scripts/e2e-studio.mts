/**
 * End-to-end check of the creator studio against a running build and the real
 * database, through the same HTTP surface a browser uses: page renders, the
 * studio's server actions, and the play submit route. No AI calls — a game is
 * started from a runtime example, and a bot play stands in for the creator.
 *
 *   cd apps/web
 *   (build, then start a server with ADMIN_EMAILS=e2e-code-play@playloop.invalid)
 *   ../../packages/db/node_modules/.bin/tsx scripts/e2e-studio.mts http://localhost:3302
 *
 * WRITES TO THE DATABASE IN .env: a draft game forked from an example (left
 * rejected at the end, so it never enters the feed), its versions, test-play
 * sessions and input logs, and a closed moderation review. No ledger entries —
 * that's one of the things it checks.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, schema } from "@playloop/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { BOT_SCRIPT } from "../../../packages/replay/src/bots.ts";
import { runSandboxed } from "../../../packages/replay/src/sandbox.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const [base] = process.argv.slice(2);
if (!base) {
  console.error("usage: tsx scripts/e2e-studio.mts <base-url>");
  process.exit(1);
}

const db = getDb();
const failures: string[] = [];
function expect(what: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(what);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function profileCookie(email: string) {
  let [p] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email));
  if (!p) [p] = await db.insert(schema.profiles).values({ email, name: "E2E", onboardedAt: new Date() }).returning();
  const token = await new SignJWT({ email: p!.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p!.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
  return { profile: p!, cookie: `pl_session=${token}` };
}

// The studio is open to ADMIN_EMAILS; the server must be started with the first of these in it.
const creator = await profileCookie("e2e-code-play@playloop.invalid");
const outsider = await profileCookie("e2e-code-play-2@playloop.invalid");

const manifest = JSON.parse(readFileSync(path.resolve(here, "../.next/server/server-reference-manifest.json"), "utf8")) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
const studioAction = (name: string) => {
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name && /create[\\/]studio[\\/]actions\.ts$/.test(v.filename))?.[0];
  if (!id) throw new Error(`${name} isn't in the build's action manifest. Build first.`);
  return id;
};
const playAction = (name: string) => {
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name && /play[\\/]\[slug\][\\/]actions\.ts$/.test(v.filename))?.[0];
  if (!id) throw new Error(`${name} isn't in the build's action manifest. Build first.`);
  return id;
};

/** Calls a server action the way the browser's bundle does, from `pagePath`. Returns the flight response text. */
async function action(cookie: string, pagePath: string, id: string, args: unknown[]) {
  const res = await fetch(`${base}${pagePath}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie },
    body: JSON.stringify(args),
  });
  return res.text();
}
function flightValue<T>(text: string, key: string): T | null {
  const line = text.split("\n").find((l) => l.includes(`"${key}"`));
  return line ? (JSON.parse(line.slice(line.indexOf(":") + 1)) as T) : null;
}

async function page(cookie: string, pagePath: string) {
  const res = await fetch(`${base}${pagePath}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

async function botPlay(code: string, seed: string) {
  const run = await runSandboxed({ code, hostScripts: [BOT_SCRIPT], expression: `__plBot.run(${JSON.stringify(seed)}, "explorer", 777, 10)`, timeLimitMs: 30_000, isolate: "inline" });
  if (!run.ok) throw new Error(run.detail);
  return JSON.parse(String(run.value)) as { score: number; ticks: number; log: unknown };
}

async function submit(cookie: string, sessionId: string, score: number, log: unknown) {
  const res = await fetch(`${base}/api/play/${sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ score, log }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

// ---- cases ----

console.log("\n1. /create is prompt-first for the studio, and unchanged for everyone else");
{
  const studio = await page(creator.cookie, "/create");
  expect("studio sees the prompt", studio.status === 200 && studio.html.includes("What do you want to create?"), String(studio.status));
  expect("templates are offered as inspiration, not required", studio.html.includes("Use a template") && studio.html.includes("Start from an example game"));
  const classic = await page(outsider.cookie, "/create");
  expect("everyone else still gets the template wizard", classic.status === 200 && !classic.html.includes("What do you want to create?"));
  const template = await page(creator.cookie, "/create/template");
  expect("the wizard is still reachable from the studio", template.status === 200);
}

console.log("\n2. starting from an example makes an editable draft, checked like any code");
const forked = flightValue<{ gameId: string }>(await action(creator.cookie, "/create", studioAction("startFromExample"), ["desert-dash"]), "gameId");
expect("a game was created", !!forked?.gameId);
if (!forked) process.exit(1);
const gameId = forked.gameId;
const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
const [v1] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.gameId, gameId));
expect("it's a draft code game owned by the creator", game!.status === "draft" && game!.gameKind === "code" && game!.creatorId === creator.profile.id);
expect("version 1 ran through the game lab and passed", v1!.validation === "pass" && v1!.via === "template" && !!v1!.report);

console.log("\n3. the studio page is the creator's alone");
{
  const mine = await page(creator.cookie, `/create/studio/${gameId}`);
  expect("renders for the creator", mine.status === 200 && mine.html.includes("Submit for review") && mine.html.includes("Test play"), String(mine.status));
  // The whole (app)/create tree has a loading.tsx, so Next.js streams a 200
  // shell before the async page component resolves notFound() — the same
  // behavior /create/games/[id] and /play/[slug] already have. The real
  // boundary isn't the HTTP status, it's that no game content ever reaches
  // someone else's response: the streamed-in replacement carries only the
  // not-found digest and a noindex meta tag.
  const theirs = await page(outsider.cookie, `/create/studio/${gameId}`);
  expect(
    "not found for anyone else, and no game content leaked",
    theirs.html.includes("NEXT_HTTP_ERROR_FALLBACK;404") && !theirs.html.includes(game!.title) && !theirs.html.includes("Submit for review"),
    String(theirs.status),
  );
  const test = await page(creator.cookie, `/play/test/${v1!.id}`);
  expect("the test-play page renders", test.status === 200 && test.html.includes("Test play"), String(test.status));
}

console.log("\n4. submitting before a verified test play is refused");
{
  await action(creator.cookie, `/create/studio/${gameId}`, studioAction("submitVersion"), [v1!.id]);
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  expect("still a draft", g!.status === "draft", g!.status);
}

console.log("\n5. a draft can't be played for points, only test-played");
{
  await action(creator.cookie, `/play/${game!.slug}`, playAction("startPlay"), [gameId, v1!.id]);
  const [open] = await db
    .select({ n: count() })
    .from(schema.playSessions)
    .where(and(eq(schema.playSessions.gameId, gameId), eq(schema.playSessions.isTest, false)));
  expect("startPlay opened no real session on a draft", (open?.n ?? 0) === 0);
}

console.log("\n6. a test play is replay-verified and never paid");
let testSessionId = "";
{
  const [before] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, creator.profile.id));
  const at = Date.now();
  const started = flightValue<{ sessionId: string; seed: string }>(
    await action(creator.cookie, `/play/test/${v1!.id}`, studioAction("startTestPlay"), [v1!.id]),
    "sessionId",
  );
  expect("test session opened with a server seed", !!started && /^[0-9a-f]{32}$/.test(started.seed));
  if (!started) process.exit(1);
  testSessionId = started.sessionId;
  const play = await botPlay(v1!.code, started.seed);
  const due = at + (play.ticks / 60) * 1000 + 1500;
  if (due > Date.now()) await sleep(due - Date.now());

  const r = await submit(creator.cookie, started.sessionId, play.score, play.log);
  expect("verified as a test", r.status === 200 && r.body.test === true && r.body.score === play.score, `${r.status} ${JSON.stringify(r.body)}`);
  const [row] = await db.select().from(schema.playSessions).where(eq(schema.playSessions.id, started.sessionId));
  expect("recorded as a completed test play with the replay's score", row!.isTest && row!.status === "completed" && row!.verifiedScore === play.score);
  expect("no payout on the session", row!.payoutPoints === null && row!.xpAwarded === null);
  const ledger = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.refId, started.sessionId));
  expect("no ledger entry", ledger.length === 0);
  const [after] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, creator.profile.id));
  expect("balance and XP unchanged", after!.pointsBalance === before!.pointsBalance && after!.xp === before!.xp);
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  expect("play count unchanged", g!.playCount === 0);
}

console.log("\n7. a forged test play fails and says why");
{
  const at = Date.now();
  const started = flightValue<{ sessionId: string; seed: string }>(
    await action(creator.cookie, `/play/test/${v1!.id}`, studioAction("startTestPlay"), [v1!.id]),
    "sessionId",
  );
  if (!started) process.exit(1);
  const play = await botPlay(v1!.code, started.seed);
  const due = at + (play.ticks / 60) * 1000 + 1500;
  if (due > Date.now()) await sleep(due - Date.now());
  const r = await submit(creator.cookie, started.sessionId, play.score + 25, play.log);
  expect("rejected with the replay's reason for the creator", r.status === 422 && r.body.reason === "score_mismatch", `${r.status} ${JSON.stringify(r.body)}`);
}

console.log("\n8. switching the current version keeps every version");
{
  // A second version, as a change would add; reuses v1's report so it counts as passing.
  const [v2] = await db
    .insert(schema.gameVersions)
    .values({ ...v1!, id: undefined, versionNumber: 2, via: "ai-change", request: "e2e: a later version", createdAt: undefined })
    .returning();
  await db.update(schema.games).set({ currentVersionId: v2!.id }).where(eq(schema.games.id, gameId));

  await action(creator.cookie, `/create/studio/${gameId}`, studioAction("makeVersionCurrent"), [v1!.id]);
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  expect("version 1 is current again", g!.currentVersionId === v1!.id);
  const versions = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.gameId, gameId));
  expect("both versions still exist", versions.length === 2);

  await action(outsider.cookie, `/create/studio/${gameId}`, studioAction("makeVersionCurrent"), [v2!.id]);
  const [still] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  expect("someone else can't switch it", still!.currentVersionId === v1!.id);
}

console.log("\n9. a tested, passing version can be submitted for review — once");
{
  await action(creator.cookie, `/create/studio/${gameId}`, studioAction("submitVersion"), [v1!.id]);
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  const [v] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, v1!.id));
  const reviews = await db.select().from(schema.moderationReviews).where(eq(schema.moderationReviews.gameId, gameId));
  expect("the game is waiting for review on that version", g!.status === "pending_review" && g!.currentVersionId === v1!.id, g!.status);
  expect("the version is marked in review", v!.status === "pending_review");
  expect("one pending moderation review", reviews.length === 1 && reviews[0]!.outcome === "pending");

  const queue = await page(creator.cookie, "/admin");
  expect("it's in the admin moderation queue", queue.status === 200 && queue.html.includes(g!.title), String(queue.status));

  await action(creator.cookie, `/create/studio/${gameId}`, studioAction("submitVersion"), [v1!.id]);
  const again = await db.select().from(schema.moderationReviews).where(eq(schema.moderationReviews.gameId, gameId));
  expect("submitting again doesn't queue it twice", again.length === 1);
}

console.log("\n10. cleaning up: the test game is closed out as rejected, never published");
await db
  .update(schema.moderationReviews)
  .set({ outcome: "rejected", notes: "e2e studio test", decidedAt: sql`now()` })
  .where(and(eq(schema.moderationReviews.gameId, gameId), eq(schema.moderationReviews.outcome, "pending")));
await db.update(schema.games).set({ status: "rejected" }).where(eq(schema.games.id, gameId));
const [closed] = await db.select().from(schema.games).where(eq(schema.games.id, gameId)).orderBy(desc(schema.games.createdAt));
expect("closed out", closed!.status === "rejected");

console.log(failures.length === 0 ? "\nAll studio checks passed.\n" : `\n${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
process.exit(failures.length === 0 ? 0 : 1);

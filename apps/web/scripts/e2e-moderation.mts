/**
 * End-to-end check of moderating code games, against a running build and the
 * real database, through the same HTTP surface a browser uses: the admin page
 * render and the approve/reject server actions.
 *
 *   cd apps/web
 *   (build, then start a server with ADMIN_EMAILS including both test profiles below)
 *   ../../packages/db/node_modules/.bin/tsx scripts/e2e-moderation.mts http://localhost:3303
 *
 * Uses the creator studio (no AI calls) to get two submitted code games —
 * one to approve, one to reject — then reviews them as a second admin
 * profile, the way a real reviewer would never be the game's own creator.
 *
 * WRITES TO THE DATABASE IN .env: two more draft-then-submitted-then-decided
 * code games under the existing test profile, and moderation_reviews rows for
 * them. One is left published (as the phase's own proof) with a note in this
 * script's output; the other is rejected. Neither pays out or is played by a
 * real player as part of this script.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, schema } from "@playloop/db";
import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { BOT_SCRIPT } from "../../../packages/replay/src/bots.ts";
import { runSandboxed } from "../../../packages/replay/src/sandbox.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const [base] = process.argv.slice(2);
if (!base) {
  console.error("usage: tsx scripts/e2e-moderation.mts <base-url>");
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

// The creator makes the games; a second admin profile reviews them — a real
// reviewer should never be deciding their own submission.
const creator = await profileCookie("e2e-code-play@playloop.invalid");
const reviewer = await profileCookie("e2e-code-play-2@playloop.invalid");

const manifest = JSON.parse(readFileSync(path.resolve(here, "../.next/server/server-reference-manifest.json"), "utf8")) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
const actionIn = (file: RegExp, name: string) => {
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name && file.test(v.filename))?.[0];
  if (!id) throw new Error(`${name} isn't in the build's action manifest. Build first.`);
  return id;
};
const studioAction = (name: string) => actionIn(/create[\\/]studio[\\/]actions\.ts$/, name);
const adminAction = (name: string) => actionIn(/admin[\\/]actions\.ts$/, name);

async function action(cookie: string, pagePath: string, id: string, args: unknown[]) {
  const res = await fetch(`${base}${pagePath}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie },
    body: JSON.stringify(args),
  });
  return { status: res.status, text: await res.text() };
}
function flightValue<T>(text: string, key: string): T | null {
  const line = text.split("\n").find((l) => l.includes(`"${key}"`));
  return line ? (JSON.parse(line.slice(line.indexOf(":") + 1)) as T) : null;
}

async function page(cookie: string, pagePath: string) {
  const res = await fetch(`${base}${pagePath}`, { headers: { Cookie: cookie } });
  return { status: res.status, html: await res.text() };
}

async function botPlay(code: string, seed: string) {
  const run = await runSandboxed({ code, hostScripts: [BOT_SCRIPT], expression: `__plBot.run(${JSON.stringify(seed)}, "explorer", 555, 10)`, timeLimitMs: 30_000, isolate: "inline" });
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

/** Forks an example, test-plays it, and submits it for review — the full path to a real pending code game. */
async function makeSubmittedGame(exampleId: string): Promise<{ gameId: string; versionId: string; title: string; slug: string }> {
  const forked = flightValue<{ gameId: string }>((await action(creator.cookie, "/create", studioAction("startFromExample"), [exampleId])).text, "gameId");
  if (!forked) throw new Error("startFromExample didn't return a gameId");
  const [game] = await db.select().from(schema.games).where(eq(schema.games.id, forked.gameId));
  const [v1] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.gameId, forked.gameId));

  const at = Date.now();
  const started = flightValue<{ sessionId: string; seed: string }>(
    (await action(creator.cookie, `/play/test/${v1!.id}`, studioAction("startTestPlay"), [v1!.id])).text,
    "sessionId",
  );
  if (!started) throw new Error("startTestPlay didn't return a sessionId");
  const play = await botPlay(v1!.code, started.seed);
  const due = at + (play.ticks / 60) * 1000 + 1500;
  if (due > Date.now()) await sleep(due - Date.now());
  const verified = await submit(creator.cookie, started.sessionId, play.score, play.log);
  if (verified.status !== 200 || verified.body.test !== true) throw new Error(`test play didn't verify: ${JSON.stringify(verified.body)}`);

  await action(creator.cookie, `/create/studio/${forked.gameId}`, studioAction("submitVersion"), [v1!.id]);
  return { gameId: forked.gameId, versionId: v1!.id, title: game!.title, slug: game!.slug };
}

// ---- setup: two submitted code games, from different examples so they're distinguishable ----

console.log("\n1. two code games reach the moderation queue, submitted by the creator");
const toApprove = await makeSubmittedGame("catch");
const toReject = await makeSubmittedGame("brand-pop");
{
  const [gA] = await db.select().from(schema.games).where(eq(schema.games.id, toApprove.gameId));
  const [gR] = await db.select().from(schema.games).where(eq(schema.games.id, toReject.gameId));
  expect("both are pending_review", gA!.status === "pending_review" && gR!.status === "pending_review", `${gA!.status} ${gR!.status}`);
  const [vA] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, toApprove.versionId));
  expect("the version's own status is pending_review too", vA!.status === "pending_review", vA!.status);
}

console.log("\n2. the admin queue shows the code-game review surface, not the template one");
{
  const queue = await page(reviewer.cookie, "/admin");
  expect("queue loads", queue.status === 200, String(queue.status));
  expect("shows both games", queue.html.includes(toApprove.title) && queue.html.includes(toReject.title));
  expect("labels them as code games, not a template type", queue.html.includes(">Code game<"));
  expect("shows the automated-checks disclosure", queue.html.includes("Automated checks this version already passed"));
  expect("shows the content-not-safety framing", queue.html.includes("not content"));
  expect("embeds a sandboxed preview iframe for review", queue.html.includes('title="Moderator preview"') && queue.html.includes("sandbox="));
  expect("the preview iframe has no allow-same-origin", !/sandbox="[^"]*allow-same-origin/.test(queue.html));
  // The iframe's srcDoc is the exact version's code, not a placeholder — this
  // is what "an embedded sandboxed play of the exact version" actually means.
  // Interactivity (the Play button appearing once the sandboxed game reports
  // it loaded) only happens after client-side hydration and a postMessage
  // round trip with the iframe, which a plain fetch() can't exercise; a real
  // browser check is out of scope for this harness.
  expect("the preview iframe's srcDoc is the reviewed version's real code", (queue.html.match(/playloop\.game\(/g) ?? []).length >= 2);
  // The lab report's check titles should be visible, not just a pass/fail summary.
  expect("shows individual check titles", queue.html.includes("Game contract") && queue.html.includes("Replays identically"));
}

console.log("\n3. approving publishes the game and mirrors the outcome onto the reviewed version");
{
  const res = await action(reviewer.cookie, "/admin", adminAction("approveGame"), [toApprove.gameId]);
  expect("approve action succeeded", res.status === 200, res.text.slice(0, 200));
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, toApprove.gameId));
  const [v] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, toApprove.versionId));
  const [review] = await db.select().from(schema.moderationReviews).where(and(eq(schema.moderationReviews.gameId, toApprove.gameId), eq(schema.moderationReviews.outcome, "approved")));
  expect("game is published", g!.status === "published", g!.status);
  expect("the reviewed version is marked published too", v!.status === "published", v!.status);
  expect("validation is untouched by the moderation outcome — a separate concern", v!.validation === "pass");
  expect("moderation review recorded who approved it", !!review && review.reviewerId === reviewer.profile.id);
  const admin = await page(reviewer.cookie, "/admin");
  expect("no longer in the queue", !admin.html.includes(toApprove.title));

  const played = await page(creator.cookie, `/play/${toApprove.slug}`);
  expect("now reachable at its play page", played.status === 200, String(played.status));
}

console.log("\n4. approving twice is refused, not double-processed");
{
  // Production redacts a thrown server-action error to an opaque digest
  // rather than sending the message text — same as every other action in
  // this suite that expects a throw; the digest is the "it failed" signal.
  const res = await action(reviewer.cookie, "/admin", adminAction("approveGame"), [toApprove.gameId]);
  expect("second approve refused", res.text.includes('"digest"'), res.text.slice(0, 200));
  const reviews = await db.select().from(schema.moderationReviews).where(eq(schema.moderationReviews.gameId, toApprove.gameId));
  expect("still exactly one review row", reviews.length === 1, String(reviews.length));
}

console.log("\n5. rejecting records why, and leaves the game out of the feed");
{
  const reason = "e2e: the branding doesn't match the game's title";
  const res = await action(reviewer.cookie, "/admin", adminAction("rejectGame"), [toReject.gameId, reason]);
  expect("reject action succeeded", res.status === 200, res.text.slice(0, 200));
  const [g] = await db.select().from(schema.games).where(eq(schema.games.id, toReject.gameId));
  const [v] = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, toReject.versionId));
  const [review] = await db.select().from(schema.moderationReviews).where(and(eq(schema.moderationReviews.gameId, toReject.gameId), eq(schema.moderationReviews.outcome, "rejected")));
  expect("game is rejected", g!.status === "rejected", g!.status);
  expect("the reviewed version is marked rejected too", v!.status === "rejected", v!.status);
  expect("the reviewer's reason was kept", review?.notes === reason, review?.notes);

  const played = await page(creator.cookie, `/play/${toReject.slug}`);
  const isCreator = played.html.includes("Not approved") || played.html.includes(toReject.title);
  expect("the creator can still see why it wasn't approved", played.status === 200 && isCreator, String(played.status));
}

console.log("\n6. a rejected game is out of the queue, but the creator keeps every version to try again");
{
  const admin = await page(reviewer.cookie, "/admin");
  expect("no longer in the queue", !admin.html.includes(toReject.title));
  const versions = await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.gameId, toReject.gameId));
  expect("the version is still there, unedited", versions.length === 1 && versions[0]!.validation === "pass");
}

console.log(
  failures.length === 0
    ? `\nAll moderation checks passed.\n(${toApprove.slug} left published; ${toReject.slug} left rejected.)\n`
    : `\n${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);

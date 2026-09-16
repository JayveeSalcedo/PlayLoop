/**
 * End-to-end check of the code-game play path against a running server and the
 * real database. Plays through the same HTTP surface a browser uses — the
 * startPlay server action and POST /api/play/[sessionId]/submit — as a
 * dedicated test profile, with a real bot play standing in for a player.
 *
 *   cd apps/web
 *   pnpm build && npx next start -p 3300          (in another shell)
 *   ../../packages/db/node_modules/.bin/tsx scripts/e2e-code-play.mts http://localhost:3300 <slug>
 *
 * <slug> must be a published code game (see seed-code-game.mts) that nobody
 * else depends on: the version-pin case temporarily points it at other versions.
 *
 * WRITES TO THE DATABASE IN .env: a test profile (e2e-code-play@playloop.invalid),
 * its play sessions, input logs and ledger entries, and two extra versions on
 * the test game. Ledger rows are append-only by design and are left in place.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, schema } from "@playloop/db";
import { fnv1a } from "@playloop/runtime";
import { and, desc, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { BOT_SCRIPT } from "../../../packages/replay/src/bots.ts";
import { runSandboxed } from "../../../packages/replay/src/sandbox.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const TEST_EMAIL = "e2e-code-play@playloop.invalid";
const [base, slug] = process.argv.slice(2);
if (!base || !slug) {
  console.error("usage: tsx scripts/e2e-code-play.mts <base-url> <slug>");
  process.exit(1);
}

const db = getDb();
const failures: string[] = [];
function expect(what: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(what);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- setup ----

const game = await db.select().from(schema.games).where(eq(schema.games.slug, slug)).then((r) => r[0]);
if (!game || game.gameKind !== "code" || !game.currentVersionId || game.status !== "published") {
  throw new Error(`${slug} must be a published code game with a current version.`);
}
const v1 = (await db.select().from(schema.gameVersions).where(eq(schema.gameVersions.id, game.currentVersionId)))[0]!;

let profile = (await db.select().from(schema.profiles).where(eq(schema.profiles.email, TEST_EMAIL)))[0];
if (!profile) {
  [profile] = await db.insert(schema.profiles).values({ email: TEST_EMAIL, name: "E2E code play", onboardedAt: new Date() }).returning();
}
const cookie = `pl_session=${await new SignJWT({ email: profile!.email })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(profile!.id)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET!))}`;

// The same action id the browser's bundle posts to.
const manifest = JSON.parse(readFileSync(path.resolve(here, "../.next/server/server-reference-manifest.json"), "utf8")) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
const actionId = (name: string) =>
  Object.entries(manifest.node).find(([, v]) => v.exportedName === name && /play[\\/]\[slug\][\\/]actions\.ts$/.test(v.filename))?.[0];
const startPlayId = actionId("startPlay");
const submitPlayId = actionId("submitPlay");
if (!startPlayId || !submitPlayId) throw new Error("Couldn't find the play actions in the build's action manifest. Build first.");

// ---- helpers ----

/** Calls a server action the way the browser's bundle does. */
function callAction(pageSlug: string, id: string, args: unknown[]) {
  return fetch(`${base}/play/${pageSlug}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie },
    body: JSON.stringify(args),
  });
}

async function startPlay(expectedVersionId: string): Promise<{ sessionId: string; seed: string } | { error: string }> {
  const res = await callAction(slug!, startPlayId!, [game!.id, expectedVersionId]);
  const text = await res.text();
  for (const line of text.split("\n")) {
    const json = line.slice(line.indexOf(":") + 1);
    if (json.includes('"sessionId"')) return JSON.parse(json) as { sessionId: string; seed: string };
  }
  // Production hides thrown messages behind a digest; a missing session is the signal.
  return { error: text.slice(0, 200) };
}

async function botPlay(code: string, seed: string) {
  const run = await runSandboxed({
    code,
    hostScripts: [BOT_SCRIPT],
    expression: `__plBot.run(${JSON.stringify(seed)}, "explorer", 4242, 10)`,
    timeLimitMs: 30_000,
    isolate: "inline",
  });
  if (!run.ok) throw new Error(`bot play failed: ${run.detail}`);
  const play = JSON.parse(String(run.value)) as { ok: boolean; score: number; ticks: number; log: { ticks: number } };
  if (!play.ok) throw new Error("bot play crashed");
  return play;
}

async function submit(sessionId: string, score: number, log: unknown) {
  const res = await fetch(`${base}/api/play/${sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ score, log }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const sessionRow = (id: string) => db.select().from(schema.playSessions).where(eq(schema.playSessions.id, id)).then((r) => r[0]!);

/** A real player can't finish sooner than the game lasts; wait that long (plus slack) after startPlay. */
async function waitForRealTime(startedAt: number, ticks: number) {
  const due = startedAt + (ticks / 60) * 1000 + 1500;
  if (due > Date.now()) await sleep(due - Date.now());
}

async function honestPlay(versionId: string, code: string) {
  const at = Date.now();
  const started = await startPlay(versionId);
  if ("error" in started) throw new Error(`startPlay failed: ${started.error}`);
  const play = await botPlay(code, started.seed);
  return { ...started, play, at };
}

// ---- cases ----

console.log(`\n${game.title} (${slug}), version ${v1.versionNumber}, runtime ${v1.runtimeVersion}, target ${v1.scoreTarget}`);

console.log("\n1. an honest play is replayed and paid the replay's score");
{
  const balanceBefore = profile!.pointsBalance;
  const { sessionId, seed, play, at } = await honestPlay(v1.id, v1.code);
  expect("server issued a seed", /^[0-9a-f]{32}$/.test(seed));
  const pinned = await sessionRow(sessionId);
  expect("session pinned to the current version", pinned.gameVersionId === v1.id);
  expect("session holds the server's seed", pinned.seed === seed);
  await waitForRealTime(at, play.ticks);

  const r = await submit(sessionId, play.score, play.log);
  expect("accepted", r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
  const row = await sessionRow(sessionId);
  expect("completed", row.status === "completed");
  expect("verified score is the replay's", row.verifiedScore === play.score, `${row.verifiedScore} vs ${play.score}`);
  expect("paid what the response says", row.payoutPoints === r.body.payoutPoints);
  const ledger = await db.select().from(schema.ledgerEntries).where(and(eq(schema.ledgerEntries.refType, "play_session"), eq(schema.ledgerEntries.refId, sessionId)));
  expect("one ledger entry", ledger.length === 1 && ledger[0]!.delta === row.payoutPoints);
  const after = (await db.select().from(schema.profiles).where(eq(schema.profiles.id, profile!.id)))[0]!;
  expect("balance moved by the payout", after.pointsBalance === balanceBefore + (row.payoutPoints ?? -1), `${balanceBefore} -> ${after.pointsBalance}`);
  const log = await db.select().from(schema.playInputLogs).where(eq(schema.playInputLogs.playSessionId, sessionId));
  expect("input log kept", log.length === 1 && log[0]!.claimedScore === play.score);

  console.log("\n2. the same session can't be submitted twice");
  const again = await submit(sessionId, play.score, play.log);
  expect("second submit refused", again.status === 409, String(again.status));
}

console.log("\n3. an inflated claim is rejected and pays nothing");
{
  const { sessionId, play, at } = await honestPlay(v1.id, v1.code);
  await waitForRealTime(at, play.ticks);
  const r = await submit(sessionId, play.score + 50, play.log);
  const row = await sessionRow(sessionId);
  expect("rejected", r.status === 422 && row.status === "rejected", String(r.status));
  expect("reason is score_mismatch", row.verifyReason === "score_mismatch", String(row.verifyReason));
  expect("replay's score recorded next to the claim", row.verifiedScore === play.score && row.score === play.score + 50);
  expect("nothing paid", row.payoutPoints === null);
}

console.log("\n4. inputs recorded under a different seed are rejected");
{
  const { sessionId, at } = await honestPlay(v1.id, v1.code);
  const forged = await botPlay(v1.code, "a-seed-of-the-players-choosing");
  await waitForRealTime(at, forged.ticks);
  const r = await submit(sessionId, forged.score, forged.log);
  const row = await sessionRow(sessionId);
  expect("rejected", r.status === 422 && row.status === "rejected", `${r.status} ${row.verifyReason}`);
}

console.log("\n5. a log claiming more play than real time allows is rejected");
{
  const { sessionId, play } = await honestPlay(v1.id, v1.code);
  const r = await submit(sessionId, play.score, play.log); // no waiting
  const row = await sessionRow(sessionId);
  expect("rejected as too_fast", r.status === 422 && row.verifyReason === "too_fast", `${r.status} ${row.verifyReason}`);
}

console.log("\n6. publishing a new version doesn't move a session already in progress");
{
  const { sessionId, play, at } = await honestPlay(v1.id, v1.code);

  // A genuinely different game as version 2, so replaying the session under it
  // would not produce the same score.
  const otherCode = readFileSync(path.resolve(here, "../../../packages/runtime/examples/catch.js"), "utf8");
  const latest = (await db.select({ n: schema.gameVersions.versionNumber }).from(schema.gameVersions).where(eq(schema.gameVersions.gameId, game.id)).orderBy(desc(schema.gameVersions.versionNumber)))[0]!.n;
  const [v2] = await db
    .insert(schema.gameVersions)
    .values({ ...v1, id: undefined, versionNumber: latest + 1, via: "manual", request: "e2e: newer version", code: otherCode, contentHash: fnv1a(otherCode), createdAt: undefined })
    .returning();
  await db.update(schema.games).set({ currentVersionId: v2!.id }).where(eq(schema.games.id, game.id));

  try {
    await waitForRealTime(at, play.ticks);
    const r = await submit(sessionId, play.score, play.log);
    expect("the version-1 session is still paid under version 1", r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);

    const stale = await startPlay(v1.id);
    expect("starting with the old version's page is refused", "error" in stale);
  } finally {
    await db.update(schema.games).set({ currentVersionId: v1.id }).where(eq(schema.games.id, game.id));
  }

  console.log("\n7. a version whose runtime this build doesn't have fails explicitly");
  const [vx] = await db
    .insert(schema.gameVersions)
    .values({ ...v1, id: undefined, versionNumber: latest + 2, via: "manual", request: "e2e: unknown runtime", runtimeVersion: 9999, createdAt: undefined })
    .returning();
  await db.update(schema.games).set({ currentVersionId: vx!.id }).where(eq(schema.games.id, game.id));
  try {
    const { sessionId: sid, play: p, at: at2 } = await honestPlay(vx!.id, v1.code);
    await waitForRealTime(at2, p.ticks);
    const r = await submit(sid, p.score, p.log);
    const row = await sessionRow(sid);
    expect("rejected as runtime_mismatch", r.status === 422 && row.verifyReason === "runtime_mismatch", `${r.status} ${row.verifyReason}`);
    expect("player told it wasn't their fault", String(r.body.error).includes("Nothing was charged"));
  } finally {
    await db.update(schema.games).set({ currentVersionId: v1.id }).where(eq(schema.games.id, game.id));
  }
}

console.log("\n8. template scoring still works, and never touches a code session");
{
  const template = (await db.select().from(schema.games).where(and(eq(schema.games.gameKind, "template"), eq(schema.games.status, "published"))).limit(1))[0];
  if (!template) {
    expect("a published template game exists to test against", false);
  } else {
    // A template play submitted instantly is rejected by its analytic rules —
    // exercising submitPlay end to end without crediting anything or bumping
    // a real game's play count.
    const res = await callAction(template.slug, startPlayId!, [template.id]);
    const text = await res.text();
    const line = text.split("\n").find((l) => l.includes('"sessionId"'));
    const templateSession = line ? (JSON.parse(line.slice(line.indexOf(":") + 1)) as { sessionId: string; seed: string | null }) : null;
    expect("template session started without a seed or version", !!templateSession && templateSession.seed === null);
    if (templateSession) {
      const row = await sessionRow(templateSession.sessionId);
      expect("template session isn't pinned to a version", row.gameVersionId === null);
      await callAction(template.slug, submitPlayId!, [templateSession.sessionId, 10]);
      const after = await sessionRow(templateSession.sessionId);
      expect("submitPlay applied the template's rules (too_fast)", after.status === "rejected" && after.rejectReason === "too_fast", `${after.status} ${after.rejectReason}`);
    }

    // A code session id sent to the template action must not be consumed.
    const code = await startPlay(v1.id);
    if ("error" in code) {
      expect("code session for the cross-check", false, code.error);
    } else {
      await callAction(slug!, submitPlayId!, [code.sessionId, 99999]);
      const row = await sessionRow(code.sessionId);
      expect("submitPlay ignored the code session", row.status === "started" && row.score === null, `${row.status} ${row.score}`);
    }
  }
}

console.log(failures.length === 0 ? "\nAll end-to-end checks passed.\n" : `\n${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
process.exit(failures.length === 0 ? 0 : 1);

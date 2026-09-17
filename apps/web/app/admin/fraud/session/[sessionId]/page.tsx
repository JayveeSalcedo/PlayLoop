import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

/**
 * One code-game play session's full evidence, for a fraud reviewer: the
 * reproduction tuple minus the code itself (shown separately, via the
 * version) — seed, claimed vs. replayed score, why it was accepted or
 * rejected, and the exact recorded input log.
 *
 * Not inlined into the fraud list page: a log can be up to 200 KB, and that
 * page can list up to 50 rejected sessions — embedding all of them would make
 * a heavy profile's page multiple megabytes for evidence nobody asked to see
 * yet. This loads one session's log on demand instead.
 */
export default async function FraudSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  await requireAdmin();
  const { sessionId } = await params;
  const db = getDb();

  const [row] = await db
    .select({
      session: schema.playSessions,
      gameTitle: schema.games.title,
      gameSlug: schema.games.slug,
      versionNumber: schema.gameVersions.versionNumber,
      runtimeVersion: schema.gameVersions.runtimeVersion,
      log: schema.playInputLogs.log,
      logBytes: schema.playInputLogs.logBytes,
    })
    .from(schema.playSessions)
    .innerJoin(schema.games, eq(schema.playSessions.gameId, schema.games.id))
    .leftJoin(schema.gameVersions, eq(schema.playSessions.gameVersionId, schema.gameVersions.id))
    .leftJoin(schema.playInputLogs, eq(schema.playInputLogs.playSessionId, schema.playSessions.id))
    .where(eq(schema.playSessions.id, sessionId));
  if (!row) notFound();
  const { session, gameTitle, gameSlug, versionNumber, runtimeVersion, log, logBytes } = row;

  let pretty = log;
  try {
    if (log) pretty = JSON.stringify(JSON.parse(log), null, 2);
  } catch {
    // Malformed logs are exactly the ones worth seeing raw — leave as-is.
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/admin/fraud/${session.profileId}`} className="text-sm font-extrabold underline">
        Back
      </Link>

      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{gameTitle}</h1>
      <p className="text-sm font-bold text-soft">
        {versionNumber != null ? `Version ${versionNumber} · ` : ""}
        {session.startedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
      </p>

      <dl className="card-hard mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-card p-4 text-sm [border:var(--border-thick)]">
        <dt className="font-bold text-soft">Status</dt>
        <dd className="font-extrabold">{session.status}</dd>
        <dt className="font-bold text-soft">Verify reason</dt>
        <dd className="font-extrabold">{session.verifyReason ?? "—"}</dd>
        <dt className="font-bold text-soft">Claimed score</dt>
        <dd className="font-extrabold">{session.score?.toLocaleString("en-US") ?? "—"}</dd>
        <dt className="font-bold text-soft">Replay score</dt>
        <dd className="font-extrabold">{session.verifiedScore?.toLocaleString("en-US") ?? "—"}</dd>
        <dt className="font-bold text-soft">Seed</dt>
        <dd className="truncate font-mono text-xs">{session.seed ?? "—"}</dd>
        <dt className="font-bold text-soft">Runtime version</dt>
        <dd className="font-extrabold">{runtimeVersion ?? "—"}</dd>
        <dt className="font-bold text-soft">Replay time</dt>
        <dd className="font-extrabold">{session.verifyMs != null ? `${session.verifyMs} ms` : "—"}</dd>
        <dt className="font-bold text-soft">Log size</dt>
        <dd className="font-extrabold">{logBytes != null ? `${(logBytes / 1000).toFixed(1)} KB` : "—"}</dd>
      </dl>

      <Link href={`/play/${gameSlug}`} className="mt-3 inline-block text-xs font-extrabold underline">
        Open the game page
      </Link>

      <h2 className="mt-6 text-lg font-extrabold">Recorded input log</h2>
      <p className="mt-1 text-xs font-bold text-soft">
        The exact tick-tagged events the player&apos;s browser recorded. Reproducing this play means loading version{" "}
        {versionNumber ?? "?"}&apos;s code, replaying this log against the seed above under runtime version {runtimeVersion ?? "?"}.
      </p>
      {pretty ? (
        <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-ink p-4 font-mono text-xs text-paper [border:var(--border-thick)]">
          {pretty}
        </pre>
      ) : (
        <p className="mt-2 text-sm font-bold text-soft">No input log was stored for this session.</p>
      )}
    </main>
  );
}

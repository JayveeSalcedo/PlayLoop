import { getDb, schema } from "@playloop/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/generation/access";
import { sweepStale, toView } from "@/lib/generation/jobs";
import { StudioGame, type StudioVersion } from "./StudioGame";

/**
 * A code game in the studio: every version it has had, what its checks found,
 * whether it's been test-played, and the controls to change, fix, revert and
 * submit it. Versions are never edited — every change adds one.
 */
export default async function StudioGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { profile } = await requireStudio();
  const { gameId } = await params;
  const { v } = await searchParams;
  const db = getDb();

  const [game] = await db
    .select()
    .from(schema.games)
    .where(and(eq(schema.games.id, gameId), eq(schema.games.creatorId, profile.id), eq(schema.games.gameKind, "code")));
  if (!game) notFound();

  await sweepStale(profile.id);
  const [versions, [openJob], tests] = await Promise.all([
    db.select().from(schema.gameVersions).where(eq(schema.gameVersions.gameId, game.id)).orderBy(desc(schema.gameVersions.versionNumber)),
    db
      .select()
      .from(schema.generationJobs)
      .where(and(eq(schema.generationJobs.gameId, game.id), eq(schema.generationJobs.profileId, profile.id), inArray(schema.generationJobs.status, ["queued", "running"])))
      .limit(1),
    db
      .select({
        versionId: schema.playSessions.gameVersionId,
        status: schema.playSessions.status,
        verifiedScore: schema.playSessions.verifiedScore,
        verifyReason: schema.playSessions.verifyReason,
      })
      .from(schema.playSessions)
      .innerJoin(schema.gameVersions, eq(schema.playSessions.gameVersionId, schema.gameVersions.id))
      .where(
        and(
          eq(schema.playSessions.profileId, profile.id),
          eq(schema.playSessions.isTest, true),
          eq(schema.gameVersions.gameId, game.id),
          inArray(schema.playSessions.status, ["completed", "rejected"]),
        ),
      )
      .orderBy(desc(schema.playSessions.completedAt)),
  ]);

  // Most recent finished test play per version.
  const lastTest = new Map<string, (typeof tests)[number]>();
  for (const t of tests) if (t.versionId && !lastTest.has(t.versionId)) lastTest.set(t.versionId, t);
  // Any verified test play at all is what submitting requires.
  const verified = new Set(tests.filter((t) => t.status === "completed").map((t) => t.versionId));

  const rows: StudioVersion[] = versions.map((ver) => {
    const report = (ver.report ?? {}) as { checks?: { title: string; status: string; summary: string }[]; fixPrompt?: string | null };
    const test = lastTest.get(ver.id);
    return {
      id: ver.id,
      versionNumber: ver.versionNumber,
      via: ver.via,
      request: ver.request,
      title: ver.title,
      summary: ver.summary,
      notes: ver.notes,
      validation: ver.validation,
      scoreTarget: ver.scoreTarget,
      createdAt: ver.createdAt.toISOString(),
      checks: (report.checks ?? []).map((c) => ({ title: c.title, status: c.status, summary: c.summary })),
      fixable: ver.validation === "fail" && !!report.fixPrompt,
      verifiedTest: verified.has(ver.id),
      lastTest: test ? { ok: test.status === "completed", score: test.verifiedScore, reason: test.verifyReason } : null,
    };
  });

  const selected = rows.find((r) => r.id === v) ?? rows.find((r) => r.id === game.currentVersionId) ?? rows[0] ?? null;

  return (
    <StudioGame
      game={{
        id: game.id,
        title: game.title,
        status: game.status,
        slug: game.slug,
        currentVersionId: game.currentVersionId,
        sponsorReady: game.sponsorReady,
        playCount: game.playCount,
      }}
      versions={rows}
      selectedId={selected?.id ?? null}
      openJob={openJob ? toView(openJob) : null}
    />
  );
}

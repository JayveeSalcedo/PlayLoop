import { getDb, schema } from "@playloop/db";
import type { GameMeta } from "@playloop/runtime";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/generation/access";
import { CodeGamePlayer } from "../../[slug]/CodeGamePlayer";

/**
 * A creator test-playing one version of their own code game from the studio,
 * whether or not the game is published. Full-screen like a real play, outside
 * the tabbed chrome.
 */
export default async function TestPlayPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { profile } = await requireStudio();
  const { versionId } = await params;

  const [row] = await getDb()
    .select({ version: schema.gameVersions, game: schema.games })
    .from(schema.gameVersions)
    .innerJoin(schema.games, eq(schema.gameVersions.gameId, schema.games.id))
    .where(and(eq(schema.gameVersions.id, versionId), eq(schema.games.creatorId, profile.id), eq(schema.games.gameKind, "code")));
  if (!row) notFound();
  const { version, game } = row;

  return (
    <CodeGamePlayer
      game={{
        id: game.id,
        slug: game.slug,
        title: version.title,
        description: version.summary,
        theme: game.theme,
        difficulty: game.difficulty,
        maxPoints: game.maxPoints,
        status: game.status,
        coverImage: game.coverImage,
      }}
      version={
        version.validation === "pass"
          ? { id: version.id, code: version.code, runtimeVersion: version.runtimeVersion, meta: version.meta as unknown as GameMeta }
          : null
      }
      test={{ backHref: `/create/studio/${game.id}?v=${version.id}` }}
    />
  );
}

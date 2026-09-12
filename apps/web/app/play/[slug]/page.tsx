import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { GamePlayer } from "./GamePlayer";

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ challenge?: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;
  const { challenge } = await searchParams;

  const db = getDb();
  const game = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug))
    .then((r) => r[0]);
  if (!game) notFound();

  // An unpublished game is visible only to the creator who made it, so they can
  // find it from the studio — but it stays unplayable for points until the
  // moderation queue approves it (startPlay enforces that too).
  const isCreator = game.creatorId != null && game.creatorId === session.sub;
  if (game.status !== "published" && !isCreator) notFound();

  return (
    <GamePlayer
      game={{
        id: game.id,
        slug: game.slug,
        type: game.type,
        title: game.title,
        description: game.description,
        theme: game.theme,
        difficulty: game.difficulty,
        maxPoints: game.maxPoints,
        config: game.config,
        status: game.status,
      }}
      challengeCode={challenge}
    />
  );
}

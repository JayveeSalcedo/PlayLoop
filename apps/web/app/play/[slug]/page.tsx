import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { GamePlayer } from "./GamePlayer";

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireSession();
  const { slug } = await params;

  const db = getDb();
  const game = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug))
    .then((r) => r[0]);
  if (!game) notFound();

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
      }}
    />
  );
}

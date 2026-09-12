import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
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

  // An unpublished game is visible only to the creator who made it (so they can
  // find it from the studio) and to an admin (so they can look at it before
  // deciding on it) — but it stays unplayable for points either way until the
  // moderation queue approves it (startPlay enforces that too).
  //
  // The admin check here reads the session's signed email claim rather than the
  // profile row, to keep this hot path to a single query. That's deliberate and
  // only widens read-only visibility; every action that actually decides a
  // game's fate goes through requireAdmin(), which reads the row.
  const isCreator = game.creatorId != null && game.creatorId === session.sub;
  if (game.status !== "published" && !isCreator && !isAdminEmail(session.email)) notFound();

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

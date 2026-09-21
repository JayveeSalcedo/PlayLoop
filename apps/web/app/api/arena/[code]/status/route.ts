export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, schema } from "@playloop/db";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const db = getDb();

  const session = await db
    .select({
      id: schema.arenaSessions.id,
      state: schema.arenaSessions.state,
      gameId: schema.arenaSessions.gameId,
      startedAt: schema.arenaSessions.startedAt,
    })
    .from(schema.arenaSessions)
    .where(eq(schema.arenaSessions.code, code.toUpperCase()))
    .then((r) => r[0]);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const players = await db
    .select({
      id: schema.arenaPlayers.id,
      profileId: schema.arenaPlayers.profileId,
      name: schema.arenaPlayers.name,
      avatarIndex: schema.arenaPlayers.avatarIndex,
      score: schema.arenaPlayers.score,
      finishedAt: schema.arenaPlayers.finishedAt,
      joinedAt: schema.arenaPlayers.joinedAt,
    })
    .from(schema.arenaPlayers)
    .where(eq(schema.arenaPlayers.sessionId, session.id))
    .orderBy(desc(schema.arenaPlayers.score));

  // Also get the game title and slug
  const game = await db
    .select({ title: schema.games.title, slug: schema.games.slug })
    .from(schema.games)
    .where(eq(schema.games.id, session.gameId))
    .then((r) => r[0]);

  return NextResponse.json({
    state: session.state,
    startedAt: session.startedAt,
    gameTitle: game?.title ?? "Game",
    gameSlug: game?.slug ?? "",
    players,
  });
}

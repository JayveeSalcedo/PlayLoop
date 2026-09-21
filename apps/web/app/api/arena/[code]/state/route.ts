export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";

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

  // Get game slug so phone can navigate to play
  const game = await db
    .select({ slug: schema.games.slug, title: schema.games.title })
    .from(schema.games)
    .where(eq(schema.games.id, session.gameId))
    .then((r) => r[0]);

  return NextResponse.json({
    state: session.state,
    startedAt: session.startedAt,
    gameSlug: game?.slug ?? "",
    gameTitle: game?.title ?? "Game",
  });
}

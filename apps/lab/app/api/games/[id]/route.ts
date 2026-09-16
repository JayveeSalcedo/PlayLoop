import { NextResponse } from "next/server";
import { getGame } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The game's code goes to the browser: it runs there (sandboxed) and is replayed on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  return NextResponse.json({ game });
}

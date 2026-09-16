import { NextResponse } from "next/server";
import { getGame, reportFor } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Checks play a game ~9 times in the sandbox; allow them time.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  return NextResponse.json({ report: await reportFor(game) });
}

/** Re-runs the checks even if a saved report exists. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  return NextResponse.json({ report: await reportFor(game, { rerun: true }) });
}

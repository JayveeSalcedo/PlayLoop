import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { addGame, listGames } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const games = await listGames();
  return NextResponse.json({ games: games.map(({ code: _code, ...rest }) => rest) });
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const result = await addGame(String(parsed.body.code ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: 422 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}

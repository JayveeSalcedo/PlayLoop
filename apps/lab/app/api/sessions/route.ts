import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { startSession } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const result = await startSession(String(parsed.body.gameId ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: 404 });
  return NextResponse.json({ sessionId: result.sessionId, seed: result.seed }, { status: 201 });
}

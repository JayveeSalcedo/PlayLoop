import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { submitSession } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const result = await submitSession(id, parsed.body);
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ verdict: result.verdict });
}

import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { TAMPER_KINDS, tamperSession, type TamperKind } from "@/lib/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const kind = parsed.body.kind as TamperKind;
  if (!TAMPER_KINDS.some((t) => t.kind === kind)) return NextResponse.json({ error: "Unknown tamper test." }, { status: 400 });
  const result = await tamperSession(id, kind);
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ verdict: result.verdict });
}

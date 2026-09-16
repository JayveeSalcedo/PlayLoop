import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { recordTestPlay, requestChange, submitProject, useVersion } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/projects/:id/change     { instruction } or { fix: true }
 * POST /api/projects/:id/version    { n }            make a version current (undo/redo)
 * POST /api/projects/:id/test-play  { sessionId }    record a server-verified play
 * POST /api/projects/:id/submit                      send for review once ready
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  let result;
  switch (action) {
    case "change":
      result = await requestChange(id, { instruction: typeof body.instruction === "string" ? body.instruction : undefined, fix: body.fix === true });
      break;
    case "version":
      result = await useVersion(id, Number(body.n));
      break;
    case "test-play":
      result = await recordTestPlay(id, String(body.sessionId ?? ""));
      break;
    case "submit":
      result = await submitProject(id);
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  }
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json(result);
}

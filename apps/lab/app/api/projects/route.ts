import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { startFromIdea, startFromTemplate } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { idea } to have the AI make version 1, or { templateId } to start from an example game. */
export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const { idea, templateId } = parsed.body;
  const result = typeof templateId === "string" ? await startFromTemplate(templateId) : await startFromIdea(String(idea ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ projectId: result.projectId, jobId: result.jobId }, { status: 201 });
}

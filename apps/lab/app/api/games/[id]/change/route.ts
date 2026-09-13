import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { startChangeJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts an AI change job on an existing game; the result is saved as a new game version. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const result = await startChangeJob(id, String(parsed.body.instruction ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ jobId: result.jobId }, { status: 202 });
}

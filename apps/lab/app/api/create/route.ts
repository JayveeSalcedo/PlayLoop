import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { startCreateJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts an AI create job; poll GET /api/jobs/:id for progress. */
export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const result = await startCreateJob(String(parsed.body.idea ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ jobId: result.jobId }, { status: 202 });
}

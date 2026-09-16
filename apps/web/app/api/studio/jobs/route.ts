/**
 * POST: start an AI generation job — { kind: "create", request } for a new game
 * from an idea, { kind: "change", versionId, request } for an edit, or
 * { kind: "fix", versionId } to fix what that version's checks found.
 * Returns the queued job; POST .../[id]/step runs it a round at a time.
 *
 * GET: this creator's recent jobs.
 *
 * See lib/generation/jobs.ts for why a job is advanced in steps.
 */
import { NextResponse } from "next/server";
import { studioProfileId } from "@/lib/generation/access";
import { createJob, listJobs, type JobKind } from "@/lib/generation/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: JobKind[] = ["create", "change", "fix"];

export async function POST(request: Request) {
  const access = await studioProfileId();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => null)) as { kind?: unknown; request?: unknown; versionId?: unknown } | null;
  const kind = body?.kind as JobKind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown request." }, { status: 400 });

  const started = await createJob({
    profileId: access.profileId,
    kind,
    request: typeof body?.request === "string" ? body.request : undefined,
    versionId: typeof body?.versionId === "string" ? body.versionId : undefined,
  });
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  return NextResponse.json(started.job, { status: 201 });
}

export async function GET() {
  const access = await studioProfileId();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json(await listJobs(access.profileId));
}

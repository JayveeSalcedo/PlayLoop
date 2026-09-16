/**
 * POST: run the next round of a generation job, then return the job.
 *
 * The studio calls this repeatedly until the job is done or failed. Each call
 * does one round — one model call plus the game lab's checks — because a whole
 * generation doesn't fit in one invocation on Vercel's Hobby limits. A call that
 * finds the job already being stepped, or finished, just returns it.
 *
 * maxDuration covers the slowest single round: a long model answer plus the
 * bot checks. A single model call can't be split, so this is the floor, not a
 * choice — if the platform caps functions lower, long answers will time out
 * here and the job is failed by its stale heartbeat.
 */
import { NextResponse } from "next/server";
import { studioProfileId } from "@/lib/generation/access";
import { stepJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must equal STEP_MAX_DURATION_MS / 1000 in lib/generation/jobs.ts; route config has to be a literal.
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await studioProfileId();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const job = await stepJob((await params).id, access.profileId);
  if (!job) return NextResponse.json({ error: "That job doesn't exist." }, { status: 404 });
  return NextResponse.json(job);
}

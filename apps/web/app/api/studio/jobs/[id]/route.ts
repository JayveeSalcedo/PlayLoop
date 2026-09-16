/** GET: one job's status and progress events, for the studio to poll. */
import { NextResponse } from "next/server";
import { studioProfileId } from "@/lib/generation/access";
import { getJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await studioProfileId();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const job = await getJob((await params).id, access.profileId);
  if (!job) return NextResponse.json({ error: "That job doesn't exist." }, { status: 404 });
  return NextResponse.json(job);
}

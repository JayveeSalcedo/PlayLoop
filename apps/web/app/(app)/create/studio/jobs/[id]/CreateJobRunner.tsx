"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobView } from "@/lib/generation/jobs";
import { JobProgress, useJobRunner } from "../../JobProgress";

export function CreateJobRunner({ initial }: { initial: JobView }) {
  const router = useRouter();
  const { job, error } = useJobRunner(initial, (ended) => {
    // A game exists whenever a version was stored — even one that failed its
    // checks, which the studio can fix.
    if (ended.gameId) router.replace(`/create/studio/${ended.gameId}?justCreated=true`);
  });

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Making your game</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        The AI writes it, bots play it, and anything they find gets fixed. You can leave — it picks up where it left off when you come back.
      </p>
      <div className="mt-6">{job ? <JobProgress job={job} error={error} /> : null}</div>
      {job?.status === "failed" && !job.gameId ? (
        <Link href="/create" className="btn go block mt-4">
          Try again
        </Link>
      ) : null}
    </main>
  );
}

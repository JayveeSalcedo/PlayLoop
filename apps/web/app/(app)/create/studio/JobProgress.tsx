"use client";

/**
 * Drives an AI generation job and shows its progress.
 *
 * A job advances one round per request (see lib/generation/jobs.ts), so this is
 * what keeps it moving: it calls the step endpoint again as soon as a round
 * finishes, until the job is done or failed. Leaving the page just stops calling;
 * opening it again picks the job back up from where it was saved.
 */
import type { JobView } from "@/lib/generation/jobs";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";

/** How long to wait before looking again when another tab is already running the round. */
const OTHER_TAB_POLL_MS = 2_000;

export function useJobRunner(initial: JobView | null, onEnd: (job: JobView) => void) {
  const [job, setJob] = useState<JobView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const jobId = job?.id ?? null;

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      let current: JobView | null = null;
      for (;;) {
        if (cancelled) return;
        try {
          const running = current?.status === "running";
          if (running) await new Promise((r) => setTimeout(r, OTHER_TAB_POLL_MS));
          const res = await fetch(running ? `/api/studio/jobs/${jobId}` : `/api/studio/jobs/${jobId}/step`, {
            method: running ? "GET" : "POST",
          });
          const data = (await res.json()) as JobView & { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Lost track of that request.");
          if (cancelled) return;
          current = data;
          setJob(data);
          if (data.status === "done" || data.status === "failed") {
            onEndRef.current(data);
            return;
          }
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Lost track of that request.");
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { job, setJob, error };
}

export function JobProgress({ job, error }: { job: JobView; error: string | null }) {
  const events = job.events;
  const last = events.at(-1);
  const working = job.status === "queued" || job.status === "running";

  return (
    <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]" aria-live="polite">
      <div className="flex items-center gap-3">
        {working ? <Spinner size={28} className="text-violet" /> : null}
        <p className="font-extrabold">
          {working ? (last?.message ?? "Getting started…") : job.status === "done" ? "Done." : "That didn't work."}
        </p>
      </div>
      {events.length > 1 ? (
        <ol className="mt-3 flex flex-col gap-1 text-xs font-bold text-soft">
          {events.slice(0, -1).map((e, i) => (
            <li key={i}>✓ {e.message}</li>
          ))}
        </ol>
      ) : null}
      {job.status === "failed" && job.problem ? <p className="mt-3 text-sm font-bold text-gum">{job.problem}</p> : null}
      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
    </div>
  );
}

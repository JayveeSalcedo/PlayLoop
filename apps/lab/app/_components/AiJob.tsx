"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { JobView } from "@/lib/jobs";

const STEP_ICON: Record<string, string> = {
  writing: "✎",
  fixing: "🔧",
  checking: "🤖",
  waiting: "⏳",
  done: "✓",
  failed: "✗",
};

/** Polls a job and shows its progress, then links to the saved game. */
export function AiJobProgress({ jobId, onFinished, hideLinks = false }: { jobId: string; onFinished?: (job: JobView) => void; hideLinks?: boolean }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = (await res.json()) as { job?: JobView; error?: string };
        if (!res.ok || !data.job) throw new Error(data.error ?? "Lost track of the job.");
        if (stopped) return;
        setJob(data.job);
        if (data.job.status === "running") setTimeout(poll, 1000);
        else onFinished?.(data.job);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void poll();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (error) return <p className="card p-4 font-bold text-gum">{error}</p>;
  if (!job) return <p className="card p-4 font-bold">Starting…</p>;

  const last = job.events.at(-1);
  const elapsed = Math.round(((job.status === "running" ? now : job.startedAt + 0) - job.startedAt) / 1000);

  return (
    <section className="card flex flex-col gap-4 p-5" aria-live="polite">
      {job.status === "running" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold">{last?.message ?? "Starting…"}</p>
          <span className="text-sm font-bold tabular-nums text-soft">{elapsed} s</span>
        </div>
      ) : job.ok ? (
        <span className="chip ok self-start">✓ Passed every check</span>
      ) : job.gameId ? (
        <span className="chip bad self-start">Made, but still fails checks</span>
      ) : (
        <span className="chip bad self-start">✗ Couldn&apos;t make this game</span>
      )}

      {job.status !== "running" && job.title ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold">{job.title}</h2>
          {job.summary ? <p className="font-semibold">{job.summary}</p> : null}
          {job.notes ? <p className="text-sm font-semibold text-soft">AI notes: {job.notes}</p> : null}
        </div>
      ) : null}
      {job.status !== "running" && job.problem ? <p className="text-sm font-bold text-gum">{job.problem}</p> : null}

      <ol className="flex flex-col gap-1 text-sm font-semibold">
        {job.events.map((e, i) => (
          <li key={i} className={i === job.events.length - 1 && job.status === "running" ? "text-ink" : "text-soft"}>
            <span aria-hidden="true" className="inline-block w-6">
              {STEP_ICON[e.step] ?? "•"}
            </span>
            {e.message}
          </li>
        ))}
      </ol>

      {job.status !== "running" ? (
        <div className="flex flex-wrap items-center gap-2">
          {job.gameId && !hideLinks ? (
            <>
              <Link href={`/play/${job.gameId}`} className="btn go sm">
                Play it
              </Link>
              <Link href={`/games/${job.gameId}/report`} className="btn sm">
                See checks{job.ok ? "" : " and ask for fixes"}
              </Link>
            </>
          ) : null}
          <span className="text-xs font-bold text-soft">
            {job.calls} AI call{job.calls === 1 ? "" : "s"} · {job.tokens.toLocaleString("en-US")} tokens
          </span>
        </div>
      ) : null}
    </section>
  );
}

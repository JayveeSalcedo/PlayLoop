"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import type { JobView } from "@/lib/generation/jobs";
import { makeVersionCurrent, submitVersion } from "../actions";
import { JobProgress, useJobRunner } from "../JobProgress";

export interface StudioVersion {
  id: string;
  versionNumber: number;
  via: "template" | "ai-create" | "ai-change" | "ai-fix" | "manual";
  request: string;
  title: string;
  summary: string;
  notes: string;
  validation: "pending" | "pass" | "fail";
  scoreTarget: number | null;
  createdAt: string;
  checks: { title: string; status: string; summary: string }[];
  /** Failed its checks, and the lab said what to fix. */
  fixable: boolean;
  /** Has at least one test play that verified. Submitting requires it. */
  verifiedTest: boolean;
  lastTest: { ok: boolean; score: number | null; reason: string | null } | null;
}

const STATUS: Record<string, { text: string; className: string }> = {
  draft: { text: "Draft", className: "bg-card" },
  pending_review: { text: "In review", className: "bg-lemon" },
  published: { text: "Live", className: "bg-mint" },
  rejected: { text: "Not approved", className: "bg-gum text-paper" },
};

const VIA: Record<StudioVersion["via"], string> = {
  "ai-create": "Made by AI",
  "ai-change": "Changed",
  "ai-fix": "Fixed",
  template: "From an example",
  manual: "Added by hand",
};

const MAX_CHANGE = 1_000;

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold [border:var(--border-thick)] ${className}`}>{children}</span>;
}

export function StudioGame({
  game,
  versions,
  selectedId,
  openJob,
}: {
  game: { id: string; title: string; status: string; slug: string; currentVersionId: string | null };
  versions: StudioVersion[];
  selectedId: string | null;
  openJob: JobView | null;
}) {
  const router = useRouter();
  const [change, setChange] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { job, setJob, error: jobError } = useJobRunner(openJob, (ended) => {
    // Open the version it made (or failed to fix) so the result is what's on screen.
    router.replace(ended.resultVersionId ? `/create/studio/${game.id}?v=${ended.resultVersionId}` : `/create/studio/${game.id}`);
    router.refresh();
    if (ended.status === "done") setChange("");
  });

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const editable = game.status === "draft" || game.status === "rejected";
  const working = job?.status === "queued" || job?.status === "running";
  const status = STATUS[game.status] ?? STATUS.draft!;

  async function startJob(body: { kind: "change" | "fix"; versionId: string; request?: string }) {
    setBusy(body.kind);
    setError(null);
    try {
      const res = await fetch("/api/studio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as JobView & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't start that — try again.");
      setJob(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  const locked = working || busy !== null;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href="/create/games" className="text-sm font-extrabold underline">
        My games
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{game.title}</h1>
        <Pill className={status.className}>{status.text}</Pill>
      </div>

      {job && (working || job.status === "failed") ? (
        <div className="mt-4">
          <JobProgress job={job} error={jobError} />
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm font-bold text-gum">{error}</p> : null}

      {selected ? (
        <section className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-soft">
              Version {selected.versionNumber} · {VIA[selected.via]}
              {selected.id === game.currentVersionId ? " · current" : ""}
            </p>
            <Pill className={selected.validation === "pass" ? "bg-mint" : selected.validation === "fail" ? "bg-gum text-paper" : "bg-paper"}>
              {selected.validation === "pass" ? "Checks passed" : selected.validation === "fail" ? "Checks failed" : "Not checked"}
            </Pill>
          </div>
          <h2 className="mt-2 text-xl font-extrabold">{selected.title}</h2>
          {selected.summary ? <p className="mt-1 text-sm text-soft">{selected.summary}</p> : null}
          {selected.request ? <p className="mt-2 text-xs font-bold text-soft">Asked for: “{selected.request}”</p> : null}
          {selected.notes ? <p className="mt-2 text-xs font-bold text-soft">AI notes: {selected.notes}</p> : null}

          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-extrabold">What the bots found</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {selected.checks.map((c) => (
                <li key={c.title} className="text-xs font-bold">
                  <span className={c.status === "fail" ? "text-gum" : "text-soft"}>
                    {c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "!"} {c.title}:
                  </span>{" "}
                  {c.summary}
                </li>
              ))}
            </ul>
            {selected.scoreTarget ? (
              <p className="mt-2 text-xs font-bold text-soft">A score of {selected.scoreTarget} earns the full points.</p>
            ) : null}
          </details>

          {selected.lastTest ? (
            <p className={`mt-3 text-xs font-bold ${selected.lastTest.ok ? "text-soft" : "text-gum"}`}>
              Last test play:{" "}
              {selected.lastTest.ok ? `verified, scored ${selected.lastTest.score ?? 0}` : `didn't verify (${selected.lastTest.reason ?? "unknown"})`}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            {selected.validation === "pass" ? (
              <Link href={`/play/test/${selected.id}`} className={`btn block ${locked ? "pointer-events-none opacity-60" : ""}`}>
                Test play
              </Link>
            ) : null}

            {selected.fixable ? (
              <button className="btn go block" disabled={locked} onClick={() => startJob({ kind: "fix", versionId: selected.id })}>
                {busy === "fix" ? <Spinner size={20} /> : "Fix what the checks found"}
              </button>
            ) : null}

            {editable && selected.id !== game.currentVersionId ? (
              <button className="btn block" disabled={locked} onClick={() => run("use", () => makeVersionCurrent(selected.id))}>
                {busy === "use" ? <Spinner size={20} /> : "Make this the current version"}
              </button>
            ) : null}

            {editable ? (
              <button
                className="btn go block"
                disabled={locked || selected.validation !== "pass" || !selected.verifiedTest}
                onClick={() => run("submit", () => submitVersion(selected.id))}
              >
                {busy === "submit" ? <Spinner size={20} /> : "Submit for review"}
              </button>
            ) : null}
            {editable && selected.validation === "pass" && !selected.verifiedTest ? (
              <p className="text-xs font-bold text-soft">Test-play this version to the end before submitting it.</p>
            ) : null}
            {game.status === "published" ? (
              <Link href={`/play/${game.slug}`} className="btn block">
                See it in the feed
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {selected ? (
        <section className="mt-6">
          <label htmlFor="change" className="text-lg font-extrabold">
            Change something
          </label>
          <p className="text-xs font-bold text-soft">Makes a new version from version {selected.versionNumber}. Nothing you have now is lost.</p>
          <textarea
            id="change"
            value={change}
            onChange={(e) => setChange(e.target.value.slice(0, MAX_CHANGE))}
            rows={3}
            placeholder="e.g. Make the player faster and add a shield power-up"
            className="mt-2 w-full rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]"
            disabled={locked}
            suppressHydrationWarning
          />
          <button
            className="btn go block mt-2"
            disabled={locked || !change.trim()}
            onClick={() => startJob({ kind: "change", versionId: selected.id, request: change })}
          >
            {busy === "change" ? <Spinner size={20} /> : "Make the change"}
          </button>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-extrabold">Versions</h2>
        <ol className="mt-2 flex flex-col gap-2">
          {versions.map((ver) => (
            <li key={ver.id}>
              <Link
                href={`/create/studio/${game.id}?v=${ver.id}`}
                className={`flex items-center gap-3 rounded-2xl p-3 [border:var(--border-thick)] ${ver.id === selectedId ? "bg-lemon" : "bg-card"}`}
              >
                <span className="text-sm font-extrabold">v{ver.versionNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{ver.title}</span>
                  <span className="block truncate text-xs font-bold text-soft">
                    {VIA[ver.via]}
                    {ver.request ? ` · ${ver.request}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-extrabold">
                  {ver.id === game.currentVersionId ? "current · " : ""}
                  {ver.validation === "pass" ? "✓" : ver.validation === "fail" ? "✗" : "…"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

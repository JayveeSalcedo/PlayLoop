"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiJobProgress } from "@/app/_components/AiJob";

const EXAMPLES = [
  "A camel dodging sandstorms and collecting dates",
  "Tap falling coffee beans; burnt beans cost points",
  "Stack boxes as high as you can",
  "Slice fruit with swipes, avoid the bombs",
];

export function CreateForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? "Couldn't start.");
      setJobId(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (jobId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-soft">“{idea}”</p>
        <AiJobProgress jobId={jobId} onFinished={() => router.refresh()} />
        <button
          className="btn sm self-start"
          type="button"
          onClick={() => {
            setJobId(null);
            setIdea("");
          }}
        >
          Make another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="idea" className="text-sm font-extrabold">
        Your idea
      </label>
      <textarea
        id="idea"
        className="card min-h-32 w-full resize-y p-4 font-semibold"
        placeholder="e.g. A falcon diving to catch fish; drag to aim, release to dive"
        maxLength={1000}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="chip bg-card" onClick={() => setIdea(example)}>
            {example}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="font-bold text-gum">
          {error}
        </p>
      ) : null}
      <button className="btn go block" type="button" onClick={create} disabled={busy || !idea.trim()}>
        {busy ? "Starting…" : "Make my game"}
      </button>
    </div>
  );
}

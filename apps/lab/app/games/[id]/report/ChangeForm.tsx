"use client";

import { useState } from "react";
import { AiJobProgress } from "@/app/_components/AiJob";

/** "Ask the AI to change it": sends an instruction (or the lab's fix list) and saves the result as a new game. */
export function ChangeForm({ gameId, suggestion }: { gameId: string; suggestion: string | null }) {
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: text }),
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

  if (jobId) return <AiJobProgress jobId={jobId} />;

  return (
    <div className="card flex flex-col gap-3 p-5">
      <label htmlFor="change" className="font-extrabold">
        Ask the AI to change it
      </label>
      <textarea
        id="change"
        className="min-h-20 w-full resize-y rounded-xl bg-paper p-3 font-semibold [border:var(--border-thick)]"
        placeholder="e.g. Make it harder after 20 seconds, and use gold coins instead of dates"
        maxLength={1000}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      {error ? (
        <p role="alert" className="font-bold text-gum">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn go sm" type="button" disabled={busy || !instruction.trim()} onClick={() => send(instruction)}>
          Make this change
        </button>
        {suggestion ? (
          <button className="btn sm" type="button" disabled={busy} onClick={() => send(suggestion)}>
            Fix what the checks found
          </button>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-soft">The result is saved as a new game, so this one stays as it is.</p>
    </div>
  );
}

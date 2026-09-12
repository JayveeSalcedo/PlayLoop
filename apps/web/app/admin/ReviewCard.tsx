"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { approveGame, markCampaignFunded, rejectGame } from "./actions";

export function FundButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await markCampaignFunded(campaignId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark that funded.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button className="btn go sm" onClick={run} disabled={busy}>
        {busy ? <Spinner size={18} /> : "Mark as funded"}
      </button>
      {error ? <p className="mt-1 text-xs font-bold text-gum">{error}</p> : null}
    </div>
  );
}

type Mode = "idle" | "rejecting" | "working";

export function ReviewCard({ gameId, title }: { gameId: string; title: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setMode("working");
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that decision — try again.");
      setMode("idle");
    }
  }

  const busy = mode === "working";

  return (
    <div className="border-t-2 border-ink/10 bg-paper p-4">
      {error ? <p className="mb-3 text-sm font-bold text-gum">{error}</p> : null}

      {mode === "rejecting" ? (
        <div>
          <label className="block text-sm font-extrabold" htmlFor={`reason-${gameId}`}>
            Why is {title} being rejected?
          </label>
          <p className="mb-2 text-xs font-bold text-soft">The creator sees this, so make it something they can act on.</p>
          <textarea
            id={`reason-${gameId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]"
            placeholder="e.g. Two of the questions have the same answer marked correct."
            suppressHydrationWarning
          />
          <div className="mt-3 flex gap-2">
            <button
              className="btn go"
              disabled={busy || !reason.trim()}
              onClick={() => run(() => rejectGame(gameId, reason))}
            >
              {busy ? (
                <>
                  <Spinner size={20} /> Rejecting…
                </>
              ) : (
                "Confirm rejection"
              )}
            </button>
            <button className="btn" disabled={busy} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="btn go" disabled={busy} onClick={() => run(() => approveGame(gameId))}>
            {busy ? (
              <>
                <Spinner size={20} /> Working…
              </>
            ) : (
              "Approve"
            )}
          </button>
          <button className="btn" disabled={busy} onClick={() => setMode("rejecting")}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

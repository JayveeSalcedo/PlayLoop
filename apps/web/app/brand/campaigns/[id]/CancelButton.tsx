"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { cancelCampaign } from "../../actions";

export function CancelButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await cancelCampaign(campaignId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel that campaign.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn" onClick={() => setConfirming(true)}>
        Cancel campaign
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <p className="font-extrabold">Cancel this campaign?</p>
      <p className="mt-1 text-sm font-bold text-soft">
        It stops counting and can&apos;t be restarted. Plays already recorded stay in the numbers.
      </p>
      {error ? <p className="mt-2 text-sm font-bold text-gum">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button className="btn go" onClick={run} disabled={busy}>
          {busy ? (
            <>
              <Spinner size={20} /> Cancelling…
            </>
          ) : (
            "Yes, cancel it"
          )}
        </button>
        <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it
        </button>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { suspendProfile, unsuspendProfile } from "../actions";

export function SuspendPanel({
  profileId,
  suspended,
  reason,
}: {
  profileId: string;
  suspended: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAsking(false);
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  if (suspended) {
    return (
      <div className="card-hard mt-4 rounded-2xl bg-gum/15 p-4 [border:var(--border-thick)]">
        <p className="font-extrabold">Suspended</p>
        {reason ? <p className="mt-1 text-sm font-bold text-soft">{reason}</p> : null}
        <p className="mt-1 text-xs font-bold text-soft">
          Can&apos;t start plays or redeem. Can still read their wallet. Points already earned were kept.
        </p>
        {error ? <p className="mt-2 text-sm font-bold text-gum">{error}</p> : null}
        <button className="btn sm mt-3" disabled={busy} onClick={() => run(() => unsuspendProfile(profileId))}>
          {busy ? <Spinner size={18} /> : "Lift suspension"}
        </button>
      </div>
    );
  }

  if (!asking) {
    return (
      <div className="mt-4">
        {error ? <p className="mb-2 text-sm font-bold text-gum">{error}</p> : null}
        <button className="btn" onClick={() => setAsking(true)}>
          Suspend account
        </button>
      </div>
    );
  }

  return (
    <div className="card-hard pop-in mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <label className="block text-sm font-extrabold" htmlFor="suspend-reason">
        Why is this account being suspended?
      </label>
      <p className="mb-2 text-xs font-bold text-soft">
        The only record of this decision — write it for whoever reads it next.
      </p>
      <textarea
        id="suspend-reason"
        rows={3}
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. 14 score_implausible rejections on one game in two days."
        className="w-full rounded-2xl bg-paper p-3 font-semibold [border:var(--border-thick)]"
        suppressHydrationWarning
      />
      {error ? <p className="mt-2 text-sm font-bold text-gum">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          className="btn go"
          disabled={busy || !text.trim()}
          onClick={() => run(() => suspendProfile(profileId, text))}
        >
          {busy ? (
            <>
              <Spinner size={20} /> Suspending…
            </>
          ) : (
            "Confirm suspension"
          )}
        </button>
        <button className="btn" disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { toggleSponsorReady } from "../../actions";

export function SponsorToggle({ gameId, initial }: { gameId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    try {
      const r = await toggleSponsorReady(gameId, next);
      setOn(r.sponsorReady);
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : "Couldn't save that — try again.");
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={toggle}
        className={`row-hard-hover flex w-full items-center gap-3 rounded-2xl p-4 text-left [border:var(--border-thick)] ${on ? "bg-mint" : "bg-card"}`}
      >
        <span className="relative h-6 w-10 shrink-0 rounded-full bg-paper [border:var(--border-thick)]">
          <span
            className="toggle-thumb block h-3 w-3 rounded-full bg-ink"
            style={{ top: "50%", left: on ? "24px" : "4px", transform: "translateY(-50%)" }}
          />
        </span>
        <span>
          <b className="block">Open to brand sponsors</b>
          <small className="block text-xs font-bold text-soft">
            Brands can fund rewards on your game. You keep 30% of the sponsorship.
          </small>
        </span>
      </button>
      {error ? <p className="mt-1 text-xs font-bold text-gum">{error}</p> : null}
    </div>
  );
}

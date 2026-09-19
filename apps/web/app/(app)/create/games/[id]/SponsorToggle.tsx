"use client";

import { useState } from "react";
import { icon } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { toggleSponsorReady } from "../../actions";

export function SponsorToggle({ gameId, initial }: { gameId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    try {
      const r = await toggleSponsorReady(gameId, next);
      setOn(r.sponsorReady);
      if (r.sponsorReady) {
        setShowModal(true);
      }
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

      {showModal && (
        <SuccessModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Game Enrolled in Brand Sponsorship!"
          badgeText="Sponsor Ready"
          iconHtml={icon("spark")}
          accentColor="mint"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Got It",
            onClick: () => setShowModal(false),
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <span className="text-base">📢</span>
                <span>Discoverable to brands looking for custom activations.</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <span className="text-base">💰</span>
                <span>You earn 30% of any sponsored voucher budget placed on your game.</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <span className="text-base">🎮</span>
                <span>Your standard creator play payout (AED 0.02/play) remains active.</span>
              </div>
            </div>
            <p className="text-xs text-soft font-semibold text-center">
              You can toggle sponsorship off at any time from your game dashboard.
            </p>
          </div>
        </SuccessModal>
      )}
    </div>
  );
}

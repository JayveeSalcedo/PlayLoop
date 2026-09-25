"use client";

import Link from "next/link";
import type { NotCreditedReason } from "./actions";

/**
 * Shown when a completed play earned nothing but the reason is one the
 * player can act on — see NotCreditedReason in actions.ts. Distinct from
 * PlayResultScreen: nothing was credited, so no payout/XP/challenge UI, but
 * the player still sees the score they got instead of just an error banner
 * that bounces them back to the intro screen with nothing to show for it.
 */
export function PlayNotCreditedScreen({
  title,
  score,
  reason,
  message,
  challengeCode,
  onPlayAgain,
}: {
  title: string;
  score: number;
  reason: NotCreditedReason;
  message: string;
  challengeCode?: string;
  onPlayAgain: () => void;
}) {
  const isGuestCap = reason === "guest_cap";

  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <p className="font-bold text-soft">{title} complete</p>
      <div className="my-1 text-7xl font-extrabold tracking-tight text-ink">{score}</div>
      <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs font-bold text-soft [border:1.5px_solid_var(--ink)]">
        Not counted
      </span>

      <div
        className={`card-hard pop-in-1 mt-4 rounded-2xl p-3 [border:var(--border-thick)] ${
          isGuestCap ? "bg-violet/10" : "bg-card"
        }`}
      >
        <p className="font-extrabold">{isGuestCap ? "🔥 Nice run — don't lose this!" : "Not verified"}</p>
        <p className="mt-1 text-sm font-bold text-soft">{message}</p>
      </div>

      {isGuestCap ? (
        <>
          <a
            href={`/login${challengeCode ? `?challenge=${encodeURIComponent(challengeCode)}` : ""}`}
            className="btn go lg block mt-4"
          >
            Save progress with OnePass
          </a>
          <div className="mt-3 flex gap-3">
            <Link href="/feed" className="btn flex-1">
              Home
            </Link>
            <button onClick={onPlayAgain} className="btn card-hard flex-1 bg-card">
              Play again
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 flex gap-3">
          <Link href="/feed" className="btn flex-1">
            Home
          </Link>
          <button onClick={onPlayAgain} className="btn go flex-1">
            Try again
          </button>
        </div>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { tier, perkForLevel } from "@playloop/economy";
import { icon } from "@playloop/ui";
import type { PlayResult } from "@/lib/creditPlay";
import { ChallengeShare } from "./ChallengeShare";
import { useFriends } from "./useFriends";

/**
 * The result screen after a paid play. Shared by the template player and the
 * code-game player, so an accepted play looks and pays out the same whichever
 * engine ran it.
 *
 * Upgraded with prototype features:
 * - 1-3 star animated performance rating
 * - Personal best and verified badges
 * - Level-up celebration modal with unlocked perk
 * - Reward proximity nudge linking to /rewards
 */
export function PlayResultScreen({
  title,
  result,
  sessionId,
  challengeCode,
  onPlayAgain,
}: {
  title: string;
  result: PlayResult;
  sessionId: string | null;
  /** The code this play fulfilled, if any — threaded through to the claim CTA below. */
  challengeCode?: string;
  onPlayAgain: () => void;
}) {
  const friends = useFriends();
  const [dismissLevelUp, setDismissLevelUp] = useState(false);

  const cr = result.challengeResult;
  const totalEarned = result.payoutPoints + (cr?.bonusAwarded ?? 0);

  // Star rating derived from score vs target
  const ratio = result.target > 0 ? result.score / result.target : 0;
  const starCount = ratio >= 0.8 ? 3 : ratio >= 0.45 ? 2 : 1;

  // Reward proximity calculation (e.g. coffee reward at 500 pts)
  const targetRewardPoints = 500;
  const pointsToReward = targetRewardPoints - result.pointsBalance;

  const showLevelUp = result.levelsGained > 0 && !dismissLevelUp;

  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <p className="font-bold text-soft">{title} complete</p>

      {/* Score */}
      <div className="my-1 text-7xl font-extrabold tracking-tight text-ink">
        {result.score}
      </div>

      {/* 1-3 Stars rating — prototype's .stars */}
      <div className="my-2 flex justify-center gap-1.5">
        {[1, 2, 3].map((starNum) => {
          const filled = starNum <= starCount;
          return (
            <span
              key={starNum}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl [border:2px_solid_var(--ink)] transition-transform ${
                filled
                  ? "bg-lemon scale-105"
                  : "bg-paper opacity-40"
              }`}
              dangerouslySetInnerHTML={{ __html: icon("star") }}
            />
          );
        })}
      </div>

      {/* Badges: Personal Best & Verified */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {result.isPersonalBest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-lemon px-3 py-0.5 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)] [box-shadow:var(--shadow-sm)] animate-bounce">
            <span dangerouslySetInnerHTML={{ __html: icon("spark") }} />
            New personal best
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs font-bold text-soft [border:1.5px_solid_var(--ink)]">
          Score verified
        </span>
      </div>

      {/* Challenge outcome, if challenged */}
      {cr ? (
        <div
          className={`card-hard pop-in-1 mt-4 rounded-2xl p-3 [border:var(--border-thick)] ${
            cr.outcome === "tie"
              ? "bg-card"
              : cr.bonusAwarded > 0
                ? "bg-mint"
                : "bg-card"
          }`}
        >
          <p className="font-extrabold">
            {cr.outcome === "tie"
              ? `It's a tie — they also scored ${cr.opponentScore.toLocaleString("en-US")}`
              : cr.bonusAwarded > 0
                ? `You beat their ${cr.opponentScore.toLocaleString("en-US")}! +${cr.bonusAwarded} bonus`
                : `They still lead with ${cr.opponentScore.toLocaleString("en-US")}`}
          </p>
        </div>
      ) : null}

      {/* Points earned card */}
      <div className="card-hard pop-in-2 mt-4 rounded-2xl bg-lemon p-4 [border:var(--border-thick)]">
        <p className="text-4xl font-extrabold">+{result.payoutPoints}</p>
        <p className="text-sm font-bold">points earned</p>
      </div>

      <p className="mt-3 text-sm font-bold text-soft">+{result.xpGain} XP</p>

      {/* Reward proximity nudge — prototype's .rnudge */}
      <Link
        href="/rewards"
        className="card-hard mt-4 flex items-center gap-2.5 rounded-2xl bg-card p-3 text-left transition-transform hover:scale-[1.01] [border:var(--border-thick)]"
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lemon [border:2px_solid_var(--ink)]"
          dangerouslySetInnerHTML={{ __html: icon("gift") }}
        />
        <div className="flex-1">
          <p className="text-xs font-extrabold">
            {pointsToReward <= 0
              ? "You have enough points to redeem a reward!"
              : `You are ${pointsToReward.toLocaleString("en-US")} points from a free reward.`}
          </p>
          <p className="text-[11px] font-bold text-soft">Browse Rewards marketplace &rarr;</p>
        </div>
      </Link>

      {/* Level-Up Modal Overlay */}
      {showLevelUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs">
          <div className="card-hard pop-in w-full max-w-xs rounded-3xl bg-lemon p-6 text-center text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <span className="text-4xl">🎉</span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Level Up!</h2>
            <div className="mt-3 rounded-2xl bg-white/60 p-3 [border:2px_solid_var(--ink)]">
              <p className="text-3xl font-extrabold">Level {result.level}</p>
              <p className="text-sm font-extrabold text-violet">{tier(result.level)}</p>
            </div>
            <p className="mt-4 text-xs font-extrabold text-soft uppercase tracking-wide">
              Perk Unlocked
            </p>
            <p className="mt-1 text-sm font-extrabold leading-snug">
              {perkForLevel(result.level)}
            </p>
            <button
              type="button"
              onClick={() => setDismissLevelUp(true)}
              className="btn go block mt-6 w-full"
            >
              Keep playing
            </button>
          </div>
        </div>
      )}

      {/* Guest save CTA vs Logged in share */}
      {result.isGuest ? (
        <>
          <div className="card-hard pop-in-3 mt-4 rounded-2xl bg-violet/10 p-4 [border:var(--border-thick)]">
            <p className="font-extrabold">🔥 Nice run — don&apos;t lose this!</p>
            <p className="mt-1 text-sm font-bold text-soft">
              Log in to lock in your {totalEarned.toLocaleString("en-US")} points before they slip away.
            </p>
          </div>
          <a
            href={`/login${challengeCode ? `?challenge=${encodeURIComponent(challengeCode)}` : ""}`}
            className="btn go lg block mt-3"
          >
            Log in to claim your reward
          </a>
        </>
      ) : (
        <>
          {sessionId ? (
            <div className="mt-6 flex">
              <ChallengeShare
                sessionId={sessionId}
                score={result.score}
                gameTitle={title}
                friends={friends}
              />
            </div>
          ) : null}
          <div className="mt-3 flex gap-3">
            <Link href="/feed" className="btn flex-1">
              Home
            </Link>
            <button onClick={onPlayAgain} className="btn go flex-1">
              Play again
            </button>
          </div>
        </>
      )}
    </main>
  );
}

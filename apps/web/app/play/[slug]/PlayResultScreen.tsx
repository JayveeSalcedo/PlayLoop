"use client";

import type { PlayResult } from "@/lib/creditPlay";
import { ChallengeShare } from "./ChallengeShare";
import { useFriends } from "./useFriends";

/**
 * The result screen after a paid play. Shared by the template player and the
 * code-game player, so an accepted play looks and pays out the same whichever
 * engine ran it.
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
  const cr = result.challengeResult;
  const totalEarned = result.payoutPoints + (cr?.bonusAwarded ?? 0);
  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <p className="font-bold text-soft">{title} complete</p>
      <div className="my-2 text-7xl font-extrabold tracking-tight text-ink">{result.score}</div>
      {cr ? (
        <div
          className={`card-hard pop-in-1 rounded-2xl p-3 [border:var(--border-thick)] ${cr.outcome === "tie" ? "bg-card" : cr.bonusAwarded > 0 ? "bg-mint" : "bg-card"}`}
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
      <div className="card-hard pop-in-2 mt-4 rounded-2xl bg-lemon p-4 [border:var(--border-thick)]">
        <p className="text-4xl font-extrabold">+{result.payoutPoints}</p>
        <p className="text-sm font-bold">points earned</p>
      </div>
      <p className="mt-3 text-sm font-bold text-soft">+{result.xpGain} XP</p>
      {result.levelsGained > 0 ? (
        <p className="mt-2 font-extrabold text-violet">Level up! Now level {result.level}</p>
      ) : null}
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
            <a href="/feed" className="btn flex-1">
              Home
            </a>
            <button onClick={onPlayAgain} className="btn go flex-1">
              Play again
            </button>
          </div>
        </>
      )}
    </main>
  );
}

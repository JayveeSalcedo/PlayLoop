"use client";

import { useState } from "react";
import Link from "next/link";
import { tier, perkForLevel } from "@playloop/economy";
import { icon } from "@playloop/ui";
import type { PlayResult } from "@/lib/creditPlay";
import { SuccessModal } from "@/app/_components/SuccessModal";
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
  arenaCode,
  onPlayAgain,
}: {
  title: string;
  result: PlayResult;
  sessionId: string | null;
  /** The code this play fulfilled, if any — threaded through to the claim CTA below. */
  challengeCode?: string;
  /** If set, this play was part of an arena session. */
  arenaCode?: string;
  onPlayAgain: () => void;
}) {
  const friends = useFriends();
  const cr = result.challengeResult;
  const totalEarned = result.payoutPoints + (cr?.bonusAwarded ?? 0);

  // Star rating derived from score vs target
  const ratio = result.target > 0 ? result.score / result.target : 0;
  const starCount = ratio >= 0.8 ? 3 : ratio >= 0.45 ? 2 : 1;

  // Reward proximity calculation (e.g. coffee reward at 500 pts)
  const targetRewardPoints = 500;
  const pointsToReward = targetRewardPoints - result.pointsBalance;

  type ActiveModal = "challenge" | "personalBest" | "levelUp" | null;
  const [activeModal, setActiveModal] = useState<ActiveModal>(() => {
    if (result.challengeResult) return "challenge";
    if (result.isPersonalBest) return "personalBest";
    if (result.levelsGained > 0) return "levelUp";
    return null;
  });

  function dismissModal(current: ActiveModal) {
    if (current === "challenge") {
      if (result.isPersonalBest) {
        setActiveModal("personalBest");
      } else if (result.levelsGained > 0) {
        setActiveModal("levelUp");
      } else {
        setActiveModal(null);
      }
    } else if (current === "personalBest") {
      if (result.levelsGained > 0) {
        setActiveModal("levelUp");
      } else {
        setActiveModal(null);
      }
    } else {
      setActiveModal(null);
    }
  }

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

      {/* Points earned card — prototype's .rearn */}
      <div className="rearn card-hard pop-in-2 mt-4 flex items-center justify-center gap-3.5 rounded-2xl bg-lemon p-4 text-ink [border:var(--border-thick)]">
        <span className="coin lg" aria-hidden="true" />
        <div className="text-left">
          <p className="text-4xl font-extrabold leading-none">+{result.payoutPoints}</p>
          <p className="text-xs font-bold uppercase tracking-wider opacity-85 mt-1">points earned</p>
        </div>
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

      {/* 1-on-1 Challenge Modal (Victory vs Defeat) */}
      {activeModal === "challenge" && cr && (
        (() => {
          const isWin = cr.outcome === "recipient" || result.score > cr.opponentScore;
          const isLoss = cr.outcome === "sender" || result.score < cr.opponentScore;
          const deficit = Math.max(0, cr.opponentScore - result.score);

          if (isWin) {
            return (
              <SuccessModal
                isOpen={true}
                onClose={() => dismissModal("challenge")}
                title="⚔️ CHALLENGE WON!"
                badgeText="Bounty Claimed"
                iconHtml={icon("crown")}
                accentColor="mint"
                confetti={true}
                soundEffect="victory"
                primaryAction={{
                  label: "Send Victory Brag (WhatsApp)",
                  onClick: () => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "https://playloop.ae";
                    const gameUrl = challengeCode
                      ? `${origin}/c/${encodeURIComponent(challengeCode)}`
                      : typeof window !== "undefined"
                        ? window.location.href.split("?")[0]
                        : `${origin}/feed`;
                    const brag = `I just beat your score of ${cr.opponentScore.toLocaleString("en-US")} in ${title} on PlayLoop with ${result.score.toLocaleString("en-US")} points! 🏆 Can you take back the lead? ${gameUrl}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(brag)}`, "_blank");
                  },
                }}
                secondaryAction={{
                  label: "Continue",
                  onClick: () => dismissModal("challenge"),
                }}
              >
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-soft uppercase">Your Score</span>
                      <p className="text-2xl font-black text-ink">{result.score.toLocaleString("en-US")}</p>
                    </div>
                    <div className="text-center border-l-2 border-ink/15">
                      <span className="text-[10px] font-bold text-soft uppercase">Their Score</span>
                      <p className="text-2xl font-black text-soft">{cr.opponentScore.toLocaleString("en-US")}</p>
                    </div>
                  </div>
                  {cr.bonusAwarded > 0 && (
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-mint/30 p-2.5 border-2 border-ink font-extrabold text-ink text-sm">
                      <span className="coin sm" aria-hidden="true" />
                      <span>+{cr.bonusAwarded} Challenge Bounty points credited!</span>
                    </div>
                  )}
                  <p className="text-xs text-soft font-medium">
                    You knocked them off the top spot. Send a brag link so they can try to reclaim it!
                  </p>
                </div>
              </SuccessModal>
            );
          }

          if (isLoss) {
            return (
              <SuccessModal
                isOpen={true}
                onClose={() => dismissModal("challenge")}
                title="⚔️ Close Match!"
                badgeText="Defeat"
                iconHtml={icon("spark")}
                accentColor="lemon"
                confetti={false}
                soundEffect="tap"
                primaryAction={{
                  label: "Retry & Beat Score",
                  onClick: onPlayAgain,
                }}
                secondaryAction={{
                  label: "View Results",
                  onClick: () => dismissModal("challenge"),
                }}
              >
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-soft uppercase">Your Score</span>
                      <p className="text-2xl font-black text-ink">{result.score.toLocaleString("en-US")}</p>
                    </div>
                    <div className="text-center border-l-2 border-ink/15">
                      <span className="text-[10px] font-bold text-soft uppercase">Leader Score</span>
                      <p className="text-2xl font-black text-gum">{cr.opponentScore.toLocaleString("en-US")}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-lemon/30 p-2.5 border-2 border-ink font-bold text-ink text-xs">
                    You were only {deficit.toLocaleString("en-US")} points behind!
                  </div>
                  <p className="text-xs text-soft font-medium">
                    Don&apos;t let them hold the lead. Tap Retry to take another shot right now!
                  </p>
                </div>
              </SuccessModal>
            );
          }

          // Tie
          return (
            <SuccessModal
              isOpen={true}
              onClose={() => dismissModal("challenge")}
              title="⚔️ Dead Heat Tie!"
              badgeText="Tied Score"
              iconHtml={icon("spark")}
              accentColor="cyan"
              confetti={false}
              soundEffect="tap"
              primaryAction={{
                label: "Play Again to Break Tie",
                onClick: onPlayAgain,
              }}
              secondaryAction={{
                label: "View Results",
                onClick: () => dismissModal("challenge"),
              }}
            >
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">
                  Both of you scored exactly {result.score.toLocaleString("en-US")} points!
                </p>
                <p className="text-xs text-soft">
                  Play one more round to break the deadlock and claim the challenger bounty.
                </p>
              </div>
            </SuccessModal>
          );
        })()
      )}

      {/* New Personal Record / High Score Modal */}
      {activeModal === "personalBest" && result.isPersonalBest && (
        <SuccessModal
          isOpen={true}
          onClose={() => dismissModal("personalBest")}
          title="🏆 NEW PERSONAL RECORD!"
          badgeText="All-Time High Score"
          iconHtml={icon("trophy")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Challenge Friends With This Score",
            onClick: () => {
              const origin = typeof window !== "undefined" ? window.location.origin : "https://playloop.ae";
              const gameUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : `${origin}/feed`;
              const text = `I just set a NEW PERSONAL RECORD of ${result.score.toLocaleString("en-US")} in ${title} on PlayLoop! Think you can beat me? ${gameUrl}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
              dismissModal("personalBest");
            },
          }}
          secondaryAction={{
            label: "Collect Points",
            onClick: () => dismissModal("personalBest"),
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
              <span className="text-xs font-bold text-soft uppercase tracking-wider">New Best Score</span>
              <p className="text-5xl font-black text-ink my-1">{result.score.toLocaleString("en-US")}</p>
              <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-mint-foreground">
                <span>⭐ {starCount} of 3 Stars</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="coin sm" aria-hidden="true" />
                  +{result.payoutPoints} pts earned
                </span>
              </div>
            </div>
            <p className="text-xs font-semibold text-soft">
              You beat your previous best run! Put your new record on the line by challenging your squad.
            </p>
          </div>
        </SuccessModal>
      )}

      {/* Level-Up & Season Pass Tier Modal */}
      {activeModal === "levelUp" && result.levelsGained > 0 && (
        <SuccessModal
          isOpen={true}
          onClose={() => dismissModal("levelUp")}
          title="🏅 Level Up & Tier Unlocked!"
          badgeText={`Level ${result.level}`}
          iconHtml={icon("trophy")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Keep Playing",
            onClick: () => dismissModal("levelUp"),
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
              <span className="text-xs font-bold text-soft uppercase tracking-wider">New Season Tier</span>
              <p className="text-3xl font-black text-violet my-1">{tier(result.level)}</p>
              <p className="text-sm font-extrabold text-ink">Level {result.level}</p>
            </div>
            <div className="w-full rounded-xl bg-mint/20 p-3 border-2 border-ink text-left">
              <span className="text-[10px] font-black uppercase tracking-wider text-soft">Perk Unlocked</span>
              <p className="text-sm font-extrabold text-ink mt-0.5">{perkForLevel(result.level)}</p>
            </div>
          </div>
        </SuccessModal>
      )}

      {/* Arena mode — score was submitted to the leaderboard */}
      {arenaCode ? (
        <>
          <div className="card-hard pop-in-3 mt-4 rounded-2xl bg-mint/20 p-4 [border:var(--border-thick)]">
            <p className="font-extrabold">✅ Score submitted to the arena!</p>
            <p className="mt-1 text-sm font-bold text-soft">
              Your score is now on the big-screen leaderboard. Head back to see the results.
            </p>
          </div>
          <div className="mt-3 flex gap-3">
            <Link href={`/events/join?code=${arenaCode}`} className="btn go flex-1">
              Back to Arena
            </Link>
          </div>
        </>
      ) : result.isGuest ? (
        <>
          <div className="card-hard pop-in-3 mt-4 rounded-2xl bg-violet/10 p-4 [border:var(--border-thick)]">
            <p className="font-extrabold">🔥 Nice run — don&apos;t lose this!</p>
            <p className="mt-1 text-sm font-bold text-soft">
              Save your progress to lock in your {result.pointsBalance.toLocaleString("en-US")} points before they slip away.
            </p>
          </div>
          <a
            href={`/login${challengeCode ? `?challenge=${encodeURIComponent(challengeCode)}` : ""}`}
            className="btn go lg block mt-3"
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

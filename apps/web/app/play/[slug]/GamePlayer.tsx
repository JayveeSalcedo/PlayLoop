"use client";

import { runGameFromConfig } from "@playloop/games";
import { artSVG, icon, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import Link from "next/link";
import { useRef, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { startChallengedPlay, startPlay, submitPlay, type PlayResult } from "./actions";
import { ChallengeShare } from "./ChallengeShare";

export interface GameRow {
  id: string;
  slug: string;
  type: "quiz" | "catch" | "memory" | "reflex";
  title: string;
  description: string;
  theme: string;
  difficulty: "Easy" | "Medium" | "Hard";
  maxPoints: number;
  config: unknown;
  status: "pending_review" | "published" | "rejected";
}

type Stage = "intro" | "starting" | "playing" | "result" | "submitting";

export function GamePlayer({ game, challengeCode }: { game: GameRow; challengeCode?: string }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<PlayResult | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const config = (game.config ?? {}) as Record<string, unknown>;

  async function start() {
    setError(null);
    setStage("starting");
    let sessionId: string;
    try {
      ({ sessionId } = challengeCode ? await startChallengedPlay(game.id, challengeCode) : await startPlay(game.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that game — check your connection and try again.");
      setStage("intro");
      return;
    }

    setStage("playing");
    requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host) return;
      const onEnd = async ({ score }: { score: number }) => {
        setStage("submitting");
        try {
          const r = await submitPlay(sessionId, score);
          setResult(r);
          setLastSessionId(sessionId);
          setStage("result");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't save that play — try again.");
          setStage("intro");
        }
      };
      const onQuit = () => setStage("intro");

      runGameFromConfig(
        game.type,
        { difficulty: game.difficulty, theme: game.theme as ThemeName, config },
        host,
        onEnd,
        onQuit,
      );
    });
  }

  if (stage === "playing") {
    // Inline position/inset (not a Tailwind class) so it can't lose a cascade
    // tie against .ghost's own `position: relative` from game-host.css.
    return <div ref={hostRef} className="ghost" style={{ position: "fixed", inset: 0 }} />;
  }

  if (stage === "submitting") {
    // The engine's cleanup() clears timers/observers but not the DOM it drew,
    // so without this the last game frame would just sit there frozen during
    // the round-trip to save the score — swap to a spinner instead.
    return (
      <div className="ghost flex flex-col items-center justify-center gap-4" style={{ position: "fixed", inset: 0 }}>
        <Spinner size={64} className="text-lemon" />
        <p className="text-sm font-bold">Saving your score…</p>
      </div>
    );
  }

  if (stage === "result" && result) {
    const cr = result.challengeResult;
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <p className="font-bold text-soft">{game.title} complete</p>
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
        {lastSessionId ? (
          <div className="mt-6 flex">
            <ChallengeShare sessionId={lastSessionId} />
          </div>
        ) : null}
        <div className="mt-3 flex gap-3">
          <a href="/feed" className="btn flex-1">
            Home
          </a>
          <button
            onClick={() => {
              setResult(null);
              setStage("intro");
            }}
            className="btn go flex-1"
          >
            Play again
          </button>
        </div>
      </main>
    );
  }

  // Only the creator can reach an unpublished game (the page 404s for everyone
  // else), so this banner is always addressed to them.
  const awaitingReview = game.status !== "published";

  return (
    <main className="mx-auto max-w-sm p-6">
      <div
        className="card-hard overflow-hidden rounded-3xl [border:var(--border-thick)]"
        dangerouslySetInnerHTML={{
          __html: artSVG(game.type as GameArtType, game.theme as ThemeName, (config.item as ItemKind) ?? "bean"),
        }}
      />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{game.title}</h1>
      <p className="mt-2 text-sm font-bold text-soft">
        {game.difficulty} · win up to {game.maxPoints} pts
      </p>
      <p className="mt-3 text-soft">{game.description}</p>
      {awaitingReview ? (
        <div className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="font-extrabold">
            {game.status === "rejected" ? "Not approved" : "Pending review"}
          </p>
          <p className="mt-1 text-sm font-bold text-soft">
            {game.status === "rejected"
              ? "This game wasn't approved for the feed, so it can't be played for points."
              : "Only you can see this game until it's approved. It isn't in the feed and doesn't pay out points yet."}
          </p>
          <Link href="/create/games" className="btn sm mt-3">
            Back to my games
          </Link>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
      <button
        onClick={start}
        disabled={stage === "starting" || awaitingReview}
        className="btn go lg block mt-6"
      >
        {stage === "starting" ? (
          <>
            <Spinner size={22} /> Starting…
          </>
        ) : (
          <>
            <span dangerouslySetInnerHTML={{ __html: icon("play", "fill") }} /> Play now
          </>
        )}
      </button>
    </main>
  );
}

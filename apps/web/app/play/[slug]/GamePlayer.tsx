"use client";

import { catchGame, quizGame, runGame, type CatchConfig, type QuizConfig } from "@playloop/games";
import { artSVG, icon, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import { useRef, useState } from "react";
import { submitPlay, type PlayResult } from "./actions";

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
}

type Stage = "intro" | "playing" | "result" | "submitting";

export function GamePlayer({ game }: { game: GameRow }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<PlayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const config = (game.config ?? {}) as { item?: ItemKind; questions?: QuizQuestionRow[] };

  function start() {
    setError(null);
    setStage("playing");
    requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host) return;
      const onEnd = async ({ score }: { score: number }) => {
        setStage("submitting");
        try {
          const r = await submitPlay(game.id, score);
          setResult(r);
          setStage("result");
        } catch {
          setError("Couldn't save that play — check your connection and try again.");
          setStage("intro");
        }
      };
      const onQuit = () => setStage("intro");

      if (game.type === "catch") {
        const catchConfig: CatchConfig = {
          difficulty: game.difficulty,
          theme: game.theme as ThemeName,
          item: config.item ?? "bean",
        };
        runGame(catchGame, catchConfig, host, onEnd, onQuit);
      } else if (game.type === "quiz") {
        const quizConfig: QuizConfig = {
          difficulty: game.difficulty,
          questions: config.questions ?? [],
        };
        runGame(quizGame, quizConfig, host, onEnd, onQuit);
      }
    });
  }

  if (stage === "playing" || stage === "submitting") {
    return <div ref={hostRef} className="ghost fixed inset-0" />;
  }

  if (stage === "result" && result) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <p className="font-bold text-soft">{game.title} complete</p>
        <div className="my-2 text-7xl font-extrabold tracking-tight text-ink">{result.score}</div>
        <div className="mt-4 rounded-2xl bg-lemon p-4 [border:var(--border-thick)]">
          <p className="text-4xl font-extrabold">+{result.payoutPoints}</p>
          <p className="text-sm font-bold">points earned</p>
        </div>
        <p className="mt-3 text-sm font-bold text-soft">+{result.xpGain} XP</p>
        {result.levelsGained > 0 ? (
          <p className="mt-2 font-extrabold text-violet">Level up! Now level {result.level}</p>
        ) : null}
        <div className="mt-6 flex gap-3">
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

  return (
    <main className="mx-auto max-w-sm p-6">
      <div
        className="overflow-hidden rounded-3xl [border:var(--border-thick)]"
        dangerouslySetInnerHTML={{
          __html: artSVG(game.type as GameArtType, game.theme as ThemeName, config.item ?? "bean"),
        }}
      />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{game.title}</h1>
      <p className="mt-2 text-sm font-bold text-soft">
        {game.difficulty} · win up to {game.maxPoints} pts
      </p>
      <p className="mt-3 text-soft">{game.description}</p>
      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
      <button
        onClick={start}
        className="btn go lg block mt-6"
        dangerouslySetInnerHTML={{ __html: `${icon("play", "fill")} Play now` }}
      />
    </main>
  );
}

interface QuizQuestionRow {
  q: string;
  a: string[];
  c: number;
}

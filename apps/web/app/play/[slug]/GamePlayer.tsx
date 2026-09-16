"use client";

import { runGameFromConfig } from "@playloop/games";
import { artSVG, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import { useRef, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { startChallengedPlay, startPlay, submitPlay, type PlayResult } from "./actions";
import { PlayIntro } from "./PlayIntro";
import { PlayResultScreen } from "./PlayResultScreen";

export interface GameRow {
  id: string;
  slug: string;
  /**
   * Which template to mount. Null for a code game, which this component can't
   * play — those go to the sandboxed runner instead.
   */
  type: "quiz" | "catch" | "memory" | "reflex" | null;
  title: string;
  description: string;
  theme: string;
  difficulty: "Easy" | "Medium" | "Hard";
  maxPoints: number;
  config: unknown;
  status: "draft" | "pending_review" | "published" | "rejected";
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
    // A code game has no template to mount; /play routes those to the
    // sandboxed runner instead, so reaching here means the route picked the
    // wrong player. Fail loudly rather than opening a session nothing can play.
    if (game.type === null) {
      setError("This game can't be played here.");
      return;
    }
    const type = game.type;
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
        type,
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
    return (
      <PlayResultScreen
        title={game.title}
        result={result}
        sessionId={lastSessionId}
        onPlayAgain={() => {
          setResult(null);
          setStage("intro");
        }}
      />
    );
  }

  return (
    <PlayIntro
      artHtml={artSVG(game.type as GameArtType, game.theme as ThemeName, (config.item as ItemKind) ?? "bean")}
      title={game.title}
      difficulty={game.difficulty}
      maxPoints={game.maxPoints}
      description={game.description}
      status={game.status}
      error={error}
      starting={stage === "starting"}
      onStart={start}
    />
  );
}

"use client";

import { payout, scoreTarget } from "@playloop/economy";
import { questionCount, runGameFromConfig, type GameDraft } from "@playloop/games";
import type { ThemeName } from "@playloop/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a draft exactly as a player would — same engine, same template, same
 * config — but with no play session and no server round-trip, so nothing is
 * written and no points are earned. The projected payout is computed locally
 * from the same @playloop/economy rules submitPlay would apply.
 */
export function TestPlay({ draft, onClose }: { draft: GameDraft; onClose: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || score !== null) return;
    const handle = runGameFromConfig(
      draft.type,
      { difficulty: draft.difficulty, theme: draft.theme as ThemeName, config: draft.config },
      host,
      ({ score: s }) => setScore(s),
      onClose,
    );
    return () => handle.abort();
    // `round` restarts the engine on "Play again"; draft is frozen while testing.
  }, [round, score]);

  if (score === null) {
    return <div ref={hostRef} className="ghost" style={{ position: "fixed", inset: 0 }} />;
  }

  const projected = payout(draft.maxPoints, score, scoreTarget(draft.type, questionCount(draft.type, draft.config)));

  return (
    // Deliberately not `.ghost` — that class paints the dark in-game backdrop,
    // which would win over this panel's own background.
    <div
      className="flex flex-col items-center justify-center gap-3 bg-paper p-6 text-center"
      style={{ position: "fixed", inset: 0, zIndex: 60 }}
    >
      <p className="text-sm font-extrabold text-soft">Test score</p>
      <div className="text-7xl font-extrabold tracking-tight">{score.toLocaleString("en-US")}</div>
      <p className="max-w-xs font-bold text-soft">
        A player scoring this would earn {projected} points. Nothing was saved — this was a test.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          className="btn"
          onClick={() => {
            setScore(null);
            setRound((r) => r + 1);
          }}
        >
          Play again
        </button>
        <button className="btn go" onClick={onClose}>
          Looks good
        </button>
      </div>
    </div>
  );
}

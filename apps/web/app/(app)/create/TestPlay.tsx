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

  // The parent passes onClose as an inline arrow, so its identity changes every
  // render. Depending on it directly would abort and restart the running game
  // each time the wizard re-renders; a ref keeps the quit button wired to the
  // latest callback without making the engine's lifetime depend on it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || score !== null) return;
    const handle = runGameFromConfig(
      draft.type,
      { difficulty: draft.difficulty, theme: draft.theme as ThemeName, config: draft.config },
      host,
      ({ score: s }) => setScore(s),
      () => onCloseRef.current(),
    );
    return () => handle.abort();
    // `round` is what restarts the engine on "Play again".
  }, [round, score, draft.type, draft.difficulty, draft.theme, draft.config]);

  if (score === null) {
    // zIndex above the (app) group's TabBar (z-50) — Test Play is the one place
    // the fullscreen game host has to cover a persistent tab bar, since /play
    // has none. The result panel below already sets this; the live host didn't.
    return <div ref={hostRef} className="ghost" style={{ position: "fixed", inset: 0, zIndex: 60 }} />;
  }

  const projected = payout(draft.maxPoints, score, scoreTarget(draft.type, questionCount(draft.type, draft.config)));

  return (
    // Deliberately not `.ghost` — that class paints the dark in-game backdrop,
    // which would win over this panel's own background.
    <div
      className="flex flex-col items-center justify-center gap-3 bg-paper p-6 text-center"
      style={{ position: "fixed", inset: 0, zIndex: 60 }}
    >
      {draft.coverImage ? (
        <div className="card-hard mb-1 h-20 w-32 overflow-hidden rounded-2xl [border:var(--border-thick)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.coverImage} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { avatar } from "@playloop/ui";
import {
  createArenaSession,
  startArenaGame,
  advanceArenaState,
} from "./actions";

type Game = {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  type: string | null;
  coverImage: string | null;
};

type Player = {
  id: string;
  profileId: string;
  name: string;
  avatarIndex: number;
  score: number;
  finishedAt: string | null;
};

type SessionStatus = {
  state: "lobby" | "countdown" | "playing" | "results";
  code: string;
  gameId: string;
  gameTitle?: string;
  players: Player[];
};

type Props = {
  games: Game[];
  profileName: string;
  initialCode?: string;
};

export function ArenaHost({ games, profileName, initialCode }: Props) {
  const [selectedGameId, setSelectedGameId] = useState(games[0]?.id ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(
    initialCode ?? null,
  );
  const [state, setState] = useState<SessionStatus["state"] | "setup">(
    initialCode ? "lobby" : "setup",
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameTitle, setGameTitle] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll session status
  const poll = useCallback(async () => {
    if (!sessionCode) return;
    try {
      const res = await fetch(`/api/arena/${sessionCode}/status`);
      if (!res.ok) return;
      const data: SessionStatus = await res.json();
      setPlayers(data.players ?? []);
      if (data.gameTitle) setGameTitle(data.gameTitle);
      if (data.state !== state && data.state !== "countdown") {
        setState(data.state);
      }
    } catch {
      /* ignore transient errors */
    }
  }, [sessionCode, state]);

  useEffect(() => {
    if (!sessionCode || state === "setup") return;
    poll();
    const iv = setInterval(poll, 2000);
    return () => clearInterval(iv);
  }, [sessionCode, state, poll]);

  // ─── Setup ────────────────────────────────────────────────────────
  async function handleCreate() {
    setError(null);
    try {
      const result = await createArenaSession(selectedGameId);
      if ("error" in result) {
        setError(String((result as { error: string }).error));
        return;
      }
      setSessionId(result.sessionId);
      setSessionCode(result.code);
      setGameTitle(
        games.find((g) => g.id === selectedGameId)?.title ?? "Game",
      );
      setState("lobby");
    } catch (e: any) {
      setError(e.message ?? "Failed to create session");
    }
  }

  // ─── Start game with countdown ───────────────────────────────────
  async function handleStart() {
    if (!sessionId) return;
    try {
      await startArenaGame(sessionId);
      setState("countdown");
      let t = 5;
      setCountdown(t);
      const iv = setInterval(() => {
        t -= 1;
        setCountdown(t);
        if (t <= 0) {
          clearInterval(iv);
          advanceArenaState(sessionId, "playing").then(() => {
            setState("playing");
            setCountdown(null);
          });
        }
      }, 1000);
    } catch (e: any) {
      setError(e.message ?? "Failed to start");
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────
  function handleReset() {
    setSessionId(null);
    setSessionCode(null);
    setPlayers([]);
    setGameTitle("");
    setCountdown(null);
    setState("setup");
  }

  const joinUrl =
    typeof window !== "undefined" && sessionCode
      ? `${window.location.origin}/events/join?code=${sessionCode}`
      : "";

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(1, ...sortedPlayers.map((p) => p.score));
  const finishedCount = players.filter((p) => p.finishedAt).length;

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070414] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <h1 className="text-2xl font-extrabold tracking-tight">
          🎮 PlayLoop Arena
        </h1>
        <span className="text-white/50 text-sm">Hosted by {profileName}</span>
      </header>

      {error && (
        <div className="mx-8 mt-4 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      <main className="flex-1 flex items-center justify-center p-8">
        {/* ── Setup ─────────────────────────────────────────────── */}
        {state === "setup" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 max-w-lg w-full text-center space-y-6">
            <h2 className="text-3xl font-extrabold">Create an Arena</h2>
            <p className="text-white/60">
              Pick a game and invite players to compete live.
            </p>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-lg focus:outline-none focus:border-yellow-400"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#070414]">
                  {g.title}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              className="w-full py-4 rounded-xl bg-yellow-400 text-[#070414] font-extrabold text-xl hover:bg-yellow-300 transition-colors"
            >
              Create Arena
            </button>
          </div>
        )}

        {/* ── Lobby ─────────────────────────────────────────────── */}
        {state === "lobby" && sessionCode && (
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Join info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center space-y-6">
              <p className="text-white/50 text-lg uppercase tracking-widest">
                Join Code
              </p>
              <div className="text-8xl font-extrabold tracking-[0.3em] text-yellow-400">
                {sessionCode}
              </div>
              <div className="text-white/40 text-sm break-all text-center max-w-md">
                {joinUrl}
              </div>
              <div className="mt-4 px-6 py-2 rounded-full bg-white/10 text-white/70 text-sm">
                {gameTitle}
              </div>
            </div>

            {/* Right: Players */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-extrabold">Players</h3>
                <span className="px-3 py-1 rounded-full bg-yellow-400 text-[#070414] font-bold text-sm">
                  {players.length}
                </span>
              </div>
              <div className="flex-1 grid grid-cols-4 sm:grid-cols-5 gap-4 content-start overflow-y-auto max-h-[400px]">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col items-center gap-1 animate-[pop_0.3s_ease-out]"
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: avatar(p.avatarIndex, 48),
                      }}
                    />
                    <span className="text-xs text-white/70 truncate max-w-[60px]">
                      {p.name}
                    </span>
                  </div>
                ))}
                {players.length === 0 && (
                  <p className="col-span-full text-white/30 text-center py-12">
                    Waiting for players…
                  </p>
                )}
              </div>
              <button
                onClick={handleStart}
                disabled={players.length === 0}
                className="mt-6 w-full py-4 rounded-xl bg-yellow-400 text-[#070414] font-extrabold text-xl hover:bg-yellow-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Start Game
              </button>
            </div>
          </div>
        )}

        {/* ── Countdown ─────────────────────────────────────────── */}
        {state === "countdown" && countdown !== null && (
          <div className="text-center">
            <p className="text-white/50 text-2xl mb-4">Game starting in</p>
            <div className="text-[12rem] font-extrabold text-yellow-400 leading-none">
              {countdown}
            </div>
          </div>
        )}

        {/* ── Playing ───────────────────────────────────────────── */}
        {state === "playing" && (
          <div className="w-full max-w-3xl space-y-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-extrabold">{gameTitle}</h2>
              <span className="px-4 py-1 rounded-full bg-white/10 text-white/60 text-sm">
                {finishedCount}/{players.length} finished
              </span>
            </div>
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4"
              >
                <span className="text-2xl font-extrabold text-white/30 w-10 text-center">
                  {i + 1}
                </span>
                <div
                  dangerouslySetInnerHTML={{
                    __html: avatar(p.avatarIndex, 40),
                  }}
                />
                <span className="font-bold text-lg flex-shrink-0">
                  {p.name}
                </span>
                <div className="flex-1 mx-4 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${(p.score / maxScore) * 100}%` }}
                  />
                </div>
                <span className="text-xl font-extrabold text-yellow-400 tabular-nums">
                  {p.score}
                </span>
              </div>
            ))}
            <button
              onClick={async () => {
                if (!sessionId) return;
                await advanceArenaState(sessionId, "results");
                setState("results");
              }}
              className="w-full mt-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-extrabold hover:bg-white/20 transition-colors"
            >
              End Game &amp; Show Results
            </button>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────── */}
        {state === "results" && (
          <div className="w-full max-w-3xl space-y-8">
            {/* Podium */}
            <div className="flex items-end justify-center gap-6">
              {[1, 0, 2].map((rank) => {
                const p = sortedPlayers[rank];
                if (!p) return null;
                const heights = ["h-40", "h-52", "h-32"];
                const labels = ["🥈 2nd", "🥇 1st", "🥉 3rd"];
                const bgs = [
                  "bg-gray-400/20",
                  "bg-yellow-400/20",
                  "bg-amber-700/20",
                ];
                const idx = rank === 0 ? 1 : rank === 1 ? 0 : 2;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col items-center gap-2 w-36"
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: avatar(p.avatarIndex, 56),
                      }}
                    />
                    <span className="font-bold text-sm truncate max-w-full">
                      {p.name}
                    </span>
                    <span className="text-2xl font-extrabold text-yellow-400">
                      {p.score}
                    </span>
                    <div
                      className={`w-full ${heights[idx]} ${bgs[idx]} rounded-t-xl border border-white/10 flex items-start justify-center pt-3`}
                    >
                      <span className="text-lg font-bold">{labels[idx]}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full leaderboard */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
              <h3 className="text-xl font-extrabold mb-4">Final Standings</h3>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="text-lg font-bold text-white/30 w-8 text-center">
                    {i + 1}
                  </span>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: avatar(p.avatarIndex, 32),
                    }}
                  />
                  <span className="font-bold flex-1">{p.name}</span>
                  <span className="font-extrabold text-yellow-400">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleReset}
              className="w-full py-4 rounded-xl bg-yellow-400 text-[#070414] font-extrabold text-xl hover:bg-yellow-300 transition-colors"
            >
              New Game
            </button>
          </div>
        )}
      </main>

      {/* Keyframe for player pop-in */}
      <style jsx global>{`
        @keyframes pop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          70% {
            transform: scale(1.15);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

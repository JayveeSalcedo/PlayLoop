"use client";

import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { avatar, icon, INK } from "@playloop/ui";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
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
  id: string;
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Press F to toggle full screen — this console is meant to be projected,
  // and a stray browser chrome/taskbar eats into that. Ignored while typing
  // in a field (the game picker's search, the join code, etc).
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable;
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "f" || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Poll session status
  const poll = useCallback(async () => {
    if (!sessionCode) return;
    try {
      const res = await fetch(`/api/arena/${sessionCode}/status`);
      if (!res.ok) return;
      const data: SessionStatus = await res.json();
      setPlayers(data.players ?? []);
      if (data.gameTitle) setGameTitle(data.gameTitle);
      // Reconnecting via ?code= (no sessionId yet, e.g. a refreshed host
      // tab) — the status endpoint is the only place we learn it, and we
      // need it both for handleStart and to scope the Realtime filters below.
      if (data.id) setSessionId((prev) => prev ?? data.id);
      if (data.state !== state && data.state !== "countdown") {
        setState(data.state);
      }
    } catch {
      /* ignore transient errors */
    }
  }, [sessionCode, state]);

  useEffect(() => {
    if (!sessionCode || state === "setup") return;
    // Defer initial poll so setState isn't called synchronously in the effect body
    const t = setTimeout(poll, 0);
    const iv = setInterval(poll, 2000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [sessionCode, state, poll]);

  // Supabase Realtime: push player joins/scores and session state instantly
  // instead of waiting on the next 2s poll. The poll above keeps running as
  // a fallback (same reasoning as ChatView's chat chan — Realtime being
  // unconfigured or briefly dropping a message shouldn't break the arena).
  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — polling still covers updates.

    const channel = supabase
      .channel(`arena-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "arena_players", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            profile_id: string;
            name: string;
            avatar_index: number;
            score: number;
            finished_at: string | null;
          };
          setPlayers((prev) =>
            prev.some((p) => p.id === row.id)
              ? prev
              : [...prev, { id: row.id, profileId: row.profile_id, name: row.name, avatarIndex: row.avatar_index, score: row.score, finishedAt: row.finished_at }],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "arena_players", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; score: number; finished_at: string | null };
          setPlayers((prev) => prev.map((p) => (p.id === row.id ? { ...p, score: row.score, finishedAt: row.finished_at } : p)));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "arena_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { state: SessionStatus["state"] };
          // The host drives its own 5s countdown locally (handleStart) —
          // don't let a Realtime echo of that same write cut it short.
          setState((prev) => (prev === "countdown" ? prev : row.state));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const joinUrl =
    typeof window !== "undefined" && sessionCode
      ? `${window.location.origin}/events/join?code=${sessionCode}`
      : "";

  // Render the join URL as a real, scannable QR whenever it changes.
  // (qrDataUrl is cleared explicitly by handleReset, not here — an effect
  // body must not call setState synchronously outside a callback.)
  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 320,
      color: { dark: INK, light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [joinUrl]);

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
    setQrDataUrl("");
    setState("setup");
  }

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(1, ...sortedPlayers.map((p) => p.score));
  const finishedCount = players.filter((p) => p.finishedAt).length;

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="ghost min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative z-[1] flex items-center justify-between border-b-2 border-white/10 px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lemon text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-hard-sm)]">
            <span className="h-5 w-5" dangerouslySetInnerHTML={{ __html: icon("gamepad") }} />
          </span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight sm:text-2xl">PlayLoop Arena</h1>
            <span className="text-xs font-semibold text-white/50 sm:text-sm">Hosted by {profileName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold text-white/30 sm:inline">
            Press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-white/60">F</kbd>{" "}
            {isFullscreen ? "to exit full screen" : "for full screen"}
          </span>
          {state !== "setup" && (
            <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white/70 sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-mint" />
              Live
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="relative z-[1] mx-6 mt-4 rounded-xl border border-gum/40 bg-gum/15 px-4 py-2.5 text-sm font-bold text-gum sm:mx-8">
          {error}
        </div>
      )}

      <main className="relative z-[1] flex flex-1 items-center justify-center p-6 sm:p-8">
        {/* ── Setup ─────────────────────────────────────────────── */}
        {state === "setup" && (
          <div className="w-full max-w-lg space-y-6 rounded-3xl border-2 border-white/10 bg-white/5 p-8 text-center sm:p-12">
            <h2 className="text-3xl font-extrabold">Create an Arena</h2>
            <p className="text-white/60">
              Pick a game and invite players to compete live.
            </p>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full rounded-xl border-2 border-white/20 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-lemon"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id} className="bg-night text-white">
                  {g.title}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              className="w-full rounded-xl bg-lemon py-4 text-xl font-extrabold text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-hard)] transition-transform active:scale-[0.98]"
            >
              Create Arena
            </button>
          </div>
        )}

        {/* ── Lobby ─────────────────────────────────────────────── */}
        {state === "lobby" && sessionCode && (
          <div className="grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            {/* Left: Join info + QR */}
            <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-white/10 bg-white/5 p-6 sm:p-10">
              <p className="text-sm font-extrabold uppercase tracking-widest text-white/50 sm:text-lg">
                Scan to Join
              </p>

              <div className="rounded-2xl border-2 border-ink bg-white p-3 [box-shadow:var(--shadow-hard)]">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Scan to join the arena" className="h-44 w-44 sm:h-56 sm:w-56" />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center sm:h-56 sm:w-56">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-ink/15 border-t-ink" />
                  </div>
                )}
              </div>

              <div className="text-6xl font-extrabold tracking-[0.3em] text-lemon sm:text-7xl">
                {sessionCode}
              </div>
              <div className="max-w-md break-all text-center text-sm text-white/40">
                {joinUrl}
              </div>
              <div className="mt-1 flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white/70">
                <span className="h-3.5 w-3.5 text-lemon" dangerouslySetInnerHTML={{ __html: icon("play") }} />
                {gameTitle}
              </div>
            </div>

            {/* Right: Players */}
            <div className="flex flex-col rounded-3xl border-2 border-white/10 bg-white/5 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-extrabold">
                  <span className="h-5 w-5" dangerouslySetInnerHTML={{ __html: icon("users") }} />
                  Players
                </h3>
                <span className="rounded-full bg-lemon px-3 py-1 text-sm font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
                  {players.length}
                </span>
              </div>
              <div className="grid flex-1 grid-cols-4 content-start gap-4 overflow-y-auto sm:grid-cols-5" style={{ maxHeight: 400 }}>
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
                    <span className="max-w-[60px] truncate text-xs text-white/70">
                      {p.name}
                    </span>
                  </div>
                ))}
                {players.length === 0 && (
                  <p className="col-span-full py-12 text-center text-white/30">
                    Waiting for players…
                  </p>
                )}
              </div>
              <button
                onClick={handleStart}
                disabled={players.length === 0}
                className="mt-6 w-full rounded-xl bg-lemon py-4 text-xl font-extrabold text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-hard)] transition-transform active:scale-[0.98] disabled:opacity-30 disabled:[box-shadow:none] disabled:active:scale-100"
              >
                Start Game
              </button>
            </div>
          </div>
        )}

        {/* ── Countdown ─────────────────────────────────────────── */}
        {state === "countdown" && countdown !== null && (
          <div className="text-center">
            <p className="mb-4 text-2xl text-white/50">Game starting in</p>
            <div
              className="text-[10rem] font-extrabold leading-none text-lemon sm:text-[12rem]"
              style={{
                WebkitTextStroke: `3px ${INK}`,
                textShadow: `6px 6px 0 ${INK}`,
              }}
            >
              {countdown}
            </div>
          </div>
        )}

        {/* ── Playing ───────────────────────────────────────────── */}
        {state === "playing" && (
          <div className="w-full max-w-3xl space-y-4">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-extrabold">{gameTitle}</h2>
              <span className="rounded-full bg-white/10 px-4 py-1 text-sm text-white/60">
                {finishedCount}/{players.length} finished
              </span>
            </div>
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-4 rounded-2xl border-2 border-white/10 bg-white/5 px-6 py-4"
              >
                <span className="w-10 text-center text-2xl font-extrabold text-white/30">
                  {i + 1}
                </span>
                <div
                  dangerouslySetInnerHTML={{
                    __html: avatar(p.avatarIndex, 40),
                  }}
                />
                <span className="flex-shrink-0 text-lg font-bold">
                  {p.name}
                </span>
                <div className="mx-4 h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-lemon transition-all duration-500"
                    style={{ width: `${(p.score / maxScore) * 100}%` }}
                  />
                </div>
                <span className="text-xl font-extrabold tabular-nums text-lemon">
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
              className="mt-4 w-full rounded-xl border-2 border-white/20 bg-white/10 py-3 font-extrabold text-white transition-colors hover:bg-white/20"
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
                const bgs = ["bg-sky/20", "bg-lemon/20", "bg-tang/20"];
                const idx = rank === 0 ? 1 : rank === 1 ? 0 : 2;
                return (
                  <div
                    key={p.id}
                    className="flex w-36 flex-col items-center gap-2"
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: avatar(p.avatarIndex, 56),
                      }}
                    />
                    <span className="max-w-full truncate text-sm font-bold">
                      {p.name}
                    </span>
                    <span className="text-2xl font-extrabold text-lemon">
                      {p.score}
                    </span>
                    <div
                      className={`w-full ${heights[idx]} ${bgs[idx]} flex items-start justify-center rounded-t-xl border-2 border-white/10 pt-3`}
                    >
                      <span className="text-lg font-bold">{labels[idx]}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full leaderboard */}
            <div className="space-y-3 rounded-3xl border-2 border-white/10 bg-white/5 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-extrabold">
                <span className="h-5 w-5" dangerouslySetInnerHTML={{ __html: icon("trophy") }} />
                Final Standings
              </h3>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="w-8 text-center text-lg font-bold text-white/30">
                    {i + 1}
                  </span>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: avatar(p.avatarIndex, 32),
                    }}
                  />
                  <span className="flex-1 font-bold">{p.name}</span>
                  <span className="font-extrabold text-lemon">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleReset}
              className="w-full rounded-xl bg-lemon py-4 text-xl font-extrabold text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-hard)] transition-transform active:scale-[0.98]"
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

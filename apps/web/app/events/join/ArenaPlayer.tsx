"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { avatar, icon } from "@playloop/ui";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { arenaAudio } from "@/lib/arenaAudio";
import { joinArenaSession } from "../actions";

/**
 * - join: the code-entry form.
 * - waiting: registered, in the lobby, watching for the host to start.
 * - spectating: the session has moved past the lobby (either this player
 *   already played and came back via "Back to Arena", or they opened the
 *   link after the host started) — holding until results land.
 * - results: the arena is done; final standings + a way back to the app.
 * - error: session not found, or something else went wrong.
 */
type Phase = "join" | "waiting" | "spectating" | "results" | "error";

interface LobbyPlayer {
  id: string;
  profileId: string;
  name: string;
  avatarIndex: number;
  score: number;
  finishedAt: string | null;
}

interface Props {
  profileId: string;
  profileName: string;
  avatarIndex: number;
  initialCode?: string;
}

export function ArenaPlayer({ profileId, profileName, avatarIndex, initialCode }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("join");
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [gameSlug, setGameSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const enteredRef = useRef(false);
  const navigatedRef = useRef(false);
  const celebratedRef = useRef(false);
  const gameSlugRef = useRef(gameSlug);
  useEffect(() => { gameSlugRef.current = gameSlug; }, [gameSlug]);

  /** Read-only status check — never joins, safe to call at any session state. */
  async function fetchStatus(codeArg: string) {
    try {
      const r = await fetch(`/api/arena/${codeArg}/status`);
      if (!r.ok) return null;
      return (await r.json()) as {
        id: string;
        state: "lobby" | "countdown" | "playing" | "results";
        gameSlug?: string;
        gameTitle?: string;
        players?: LobbyPlayer[];
      };
    } catch {
      return null;
    }
  }

  /**
   * Entry point for both the manual "Join" button and the auto-join effect.
   * Checks the session's current state before doing anything: joinArenaSession
   * only works while the session is in "lobby" (it throws otherwise), which is
   * exactly the situation a player returning from PlayResultScreen's "Back to
   * Arena" link is in — they're already registered, they just want to see
   * where things stand, not to join again.
   */
  const enterArena = useCallback(async (rawCode: string) => {
    const codeUpper = rawCode.trim().toUpperCase();
    if (!codeUpper || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await fetchStatus(codeUpper);
      if (!status) throw new Error("Session not found");

      setCode(codeUpper);
      setSessionId(status.id);
      if (status.gameSlug) setGameSlug(status.gameSlug);
      if (status.gameTitle) setGameTitle(status.gameTitle);
      setPlayers(status.players ?? []);

      if (status.state === "results") {
        setPhase("results");
      } else if (status.state === "lobby") {
        await joinArenaSession(codeUpper);
        setPhase("waiting");
      } else {
        // Already playing/counting down — hold here until results land.
        setPhase("spectating");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  /* A light "you made it!" moment — once per join, not on every re-render
   * (phase flips to "waiting" exactly once per successful enterArena). */
  useEffect(() => {
    if (phase !== "waiting" || celebratedRef.current) return;
    celebratedRef.current = true;
    try {
      arenaAudio.playTap();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.35 },
        colors: ["#FFDD3C", "#3FC8FF", "#FF5FA2", "#22D39B", "#5B3BFF"],
        disableForReducedMotion: true,
        zIndex: 200,
      });
    } catch {
      // ignore — purely decorative
    }
  }, [phase]);

  /* Auto-enter when initialCode is provided (QR scan, or PlayResultScreen's
   * "Back to Arena" link). */
  useEffect(() => {
    if (initialCode && !enteredRef.current) {
      enteredRef.current = true;
      enterArena(initialCode);
    }
  }, [initialCode, enterArena]);

  /** Navigate to the game once the host starts it — called from either the
   *  poll or the Realtime push below, whichever notices first. */
  const goToGame = useCallback((slugFromEvent?: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    clearInterval(pollRef.current);
    const slug = slugFromEvent || gameSlugRef.current;
    router.push(`/play/${slug}?arena=${sessionId}&arenaCode=${code}`);
  }, [router, sessionId, code]);

  /* Poll while waiting (for the lobby roster + game start) or spectating
   * (for results) — fallback if Realtime below is unavailable. */
  useEffect(() => {
    if ((phase !== "waiting" && phase !== "spectating") || !code) return;
    const poll = async () => {
      const data = await fetchStatus(code);
      if (!data) return;
      if (data.gameTitle) setGameTitle(data.gameTitle);
      if (data.players) setPlayers(data.players);
      if (data.state === "playing" && phase === "waiting") goToGame(data.gameSlug);
      else if (data.state === "results") setPhase("results");
    };
    // Fire once immediately so the screen isn't empty for a full 2s, then keep polling as a fallback.
    const t = setTimeout(poll, 0);
    pollRef.current = setInterval(poll, 2000);
    return () => { clearTimeout(t); clearInterval(pollRef.current); };
  }, [phase, code, goToGame]);

  /* Realtime: react the instant the host starts the game or ends it, and
   * mirror other players joining the lobby live (same reasoning as
   * ArenaHost's own subscription). The poll above stays on as a fallback. */
  useEffect(() => {
    if ((phase !== "waiting" && phase !== "spectating") || !code || !sessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — polling still covers this.

    const channel = supabase
      .channel(`arena-join-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "arena_sessions", filter: `code=eq.${code}` },
        (payload) => {
          const row = payload.new as { state: string };
          if (row.state === "playing" && phase === "waiting") {
            goToGame();
          } else if (row.state === "results") {
            // Refresh so the results screen opens with final scores, not
            // whatever the roster last looked like mid-game.
            fetchStatus(code).then((data) => { if (data?.players) setPlayers(data.players); });
            setPhase("results");
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "arena_players", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; profile_id: string; name: string; avatar_index: number; score: number; finished_at: string | null };
          setPlayers((prev) =>
            prev.some((p) => p.id === row.id)
              ? prev
              : [...prev, { id: row.id, profileId: row.profile_id, name: row.name, avatarIndex: row.avatar_index, score: row.score, finishedAt: row.finished_at }],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, code, sessionId, goToGame]);

  /* ── Join phase ─────────────────────────────── */
  if (phase === "join") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6">
        <h1 className="text-3xl font-extrabold text-ink">Join Arena</h1>
        <div className="card-hard w-full max-w-xs space-y-4 rounded-2xl bg-card p-6 [border:var(--border-thick)]">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            maxLength={6}
            className="w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-center text-2xl font-extrabold uppercase tracking-widest text-ink outline-none focus:ring-2 focus:ring-violet"
          />
          <button
            onClick={() => enterArena(code)}
            disabled={busy || code.length < 4}
            className="w-full rounded-xl bg-lemon px-6 py-3 font-extrabold text-ink [border:var(--border-thick)] disabled:opacity-50"
          >
            {busy ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Waiting phase ──────────────────────────── */
  if (phase === "waiting") {
    const others = players.filter((p) => p.profileId !== profileId);
    const shown = others.slice(0, 6);
    const overflow = others.length - shown.length;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 pb-10">
        <div
          className="pop-in flex h-24 w-24 items-center justify-center rounded-full bg-lemon [border:var(--border-thick)] [box-shadow:var(--shadow-hard)]"
          dangerouslySetInnerHTML={{ __html: avatar(avatarIndex, 88) }}
        />

        <div className="card-hard w-full max-w-xs space-y-4 rounded-3xl bg-card p-6 text-center [border:var(--border-thick)]">
          <div>
            <p className="flex items-center justify-center gap-1.5 text-lg font-extrabold text-ink">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full bg-mint text-xs text-white"
                dangerouslySetInnerHTML={{ __html: icon("check") }}
              />
              You&rsquo;re in, {profileName}!
            </p>
            {gameTitle && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
                <span dangerouslySetInnerHTML={{ __html: icon("gamepad") }} />
                {gameTitle}
              </span>
            )}
          </div>

          <div className="border-t-2 border-dashed border-ink/10 pt-4">
            <p className="flex items-center justify-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-soft">
              <span dangerouslySetInnerHTML={{ __html: icon("users") }} />
              {players.length} in the lobby
            </p>
            {shown.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {shown.map((p) => (
                  <div key={p.id} className="pop-in flex flex-col items-center gap-1">
                    <span
                      className="h-9 w-9 overflow-hidden rounded-full [border:1.5px_solid_var(--ink)]"
                      dangerouslySetInnerHTML={{ __html: avatar(p.avatarIndex, 36) }}
                    />
                    <span className="max-w-[52px] truncate text-[10px] font-bold text-ink/60">{p.name}</span>
                  </div>
                ))}
                {overflow > 0 && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-xs font-extrabold text-ink/60 [border:1.5px_solid_var(--ink)]">
                    +{overflow}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-ink/40">You&rsquo;re the first one here.</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-ink/60">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-mint" />
            <span className="text-sm font-semibold">Waiting for the host to start…</span>
          </div>
          <p className="font-mono text-xs text-ink/40">Code: {code}</p>
        </div>
      </div>
    );
  }

  /* ── Spectating phase — game's on, holding for results ────────── */
  if (phase === "spectating") {
    const finishedCount = players.filter((p) => p.finishedAt).length;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 pb-10">
        <div className="card-hard w-full max-w-xs space-y-4 rounded-3xl bg-card p-6 text-center [border:var(--border-thick)]">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet/15 text-2xl text-violet"
            dangerouslySetInnerHTML={{ __html: icon("bolt") }}
          />
          <div>
            <p className="text-lg font-extrabold text-ink">Game in progress</p>
            {gameTitle && <p className="text-sm font-bold text-soft">{gameTitle}</p>}
          </div>
          {players.length > 0 && (
            <p className="text-xs font-extrabold uppercase tracking-wider text-soft">
              {finishedCount}/{players.length} finished
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-ink/60">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-mint" />
            <span className="text-sm font-semibold">Waiting for results…</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Results phase ──────────────────────────── */
  if (phase === "results") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const myIndex = sorted.findIndex((p) => p.profileId === profileId);
    const me = myIndex >= 0 ? sorted[myIndex] : null;

    return (
      <div className="flex min-h-dvh flex-col items-center gap-4 bg-paper px-6 py-10">
        <div
          className="pop-in flex h-20 w-20 items-center justify-center rounded-full bg-lemon text-4xl text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-hard)]"
          dangerouslySetInnerHTML={{ __html: icon("trophy") }}
        />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-ink">Results are in!</h1>
          {gameTitle && <p className="text-sm font-bold text-soft">{gameTitle}</p>}
        </div>

        {me && (
          <div className="pop-in-1 w-full max-w-xs rounded-2xl bg-lemon/25 p-4 text-center [border:var(--border-thick)]">
            <p className="text-xs font-extrabold uppercase tracking-wider text-soft">Your placement</p>
            <p className="mt-1 text-4xl font-extrabold text-ink">#{myIndex + 1}</p>
            <p className="text-sm font-bold text-ink/70">{me.score.toLocaleString()} pts</p>
          </div>
        )}

        <div className="pop-in-2 card-hard w-full max-w-xs space-y-1.5 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-soft">
            <span dangerouslySetInnerHTML={{ __html: icon("users") }} />
            Final Standings
          </p>
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-xl p-2 ${p.profileId === profileId ? "bg-lemon/25" : ""}`}
            >
              <span className="w-5 shrink-0 text-center text-xs font-extrabold text-ink/50">{i + 1}</span>
              <span
                className="h-8 w-8 shrink-0 overflow-hidden rounded-full [border:1.5px_solid_var(--ink)]"
                dangerouslySetInnerHTML={{ __html: avatar(p.avatarIndex, 32) }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {p.name}
                {p.profileId === profileId ? " (You)" : ""}
              </span>
              <span className="shrink-0 text-sm font-extrabold text-ink">{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <Link href="/feed" className="btn go w-full max-w-xs">
          Go to Home
        </Link>
      </div>
    );
  }

  /* ── Error phase ────────────────────────────── */
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6">
      <div className="card-hard w-full max-w-xs space-y-4 rounded-2xl bg-card p-6 text-center [border:var(--border-thick)]">
        <p className="text-lg font-extrabold text-ink">Oops!</p>
        <p className="text-sm text-ink/70">{error}</p>
        <button
          onClick={() => { setError(""); setPhase("join"); }}
          className="w-full rounded-xl bg-lemon px-6 py-3 font-extrabold text-ink [border:var(--border-thick)]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

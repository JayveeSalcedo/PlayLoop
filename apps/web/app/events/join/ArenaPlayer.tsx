"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { joinArenaSession } from "../actions";

type Phase = "join" | "waiting" | "error";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const joinedRef = useRef(false);
  const navigatedRef = useRef(false);
  const gameSlugRef = useRef(gameSlug);
  useEffect(() => { gameSlugRef.current = gameSlug; }, [gameSlug]);

  const doJoin = useCallback(async (joinCode: string) => {
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await joinArenaSession(joinCode.trim().toUpperCase());
      setCode(joinCode.trim().toUpperCase());
      setSessionId(res.sessionId);
      setGameSlug(res.gameSlug ?? "");
      setPhase("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  /* Auto-join when initialCode is provided */
  useEffect(() => {
    if (initialCode && !joinedRef.current) {
      joinedRef.current = true;
      doJoin(initialCode);
    }
  }, [initialCode, doJoin]);

  /** Navigate to the game once the host starts it — called from either the
   *  poll or the Realtime push below, whichever notices first. */
  const goToGame = useCallback((slugFromEvent?: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    clearInterval(pollRef.current);
    const slug = slugFromEvent || gameSlugRef.current;
    router.push(`/play/${slug}?arena=${sessionId}&arenaCode=${code}`);
  }, [router, sessionId, code]);

  /* Poll for game start while waiting (fallback if Realtime is unavailable) */
  useEffect(() => {
    if (phase !== "waiting" || !code) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/arena/${code}/state`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.gameTitle) setGameTitle(data.gameTitle);
        if (data.state === "playing") goToGame(data.gameSlug);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [phase, code, goToGame]);

  /* Realtime: jump the moment the host starts the game instead of waiting
   * on the next poll tick. The poll above stays on as a fallback. */
  useEffect(() => {
    if (phase !== "waiting" || !code) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — polling still covers this.

    const channel = supabase
      .channel(`arena-join-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "arena_sessions", filter: `code=eq.${code}` },
        (payload) => {
          const row = payload.new as { state: string };
          if (row.state === "playing") goToGame();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, code, goToGame]);

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
            onClick={() => doJoin(code)}
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
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6">
        <div className="card-hard w-full max-w-xs space-y-4 rounded-2xl bg-card p-6 text-center [border:var(--border-thick)]">
          <p className="text-lg font-extrabold text-ink">You&rsquo;re in! 🎉</p>
          {gameTitle && <p className="text-sm font-bold text-ink/70">{gameTitle}</p>}
          <div className="flex items-center justify-center gap-2 text-ink/60">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-mint" />
            <span className="text-sm font-semibold">Waiting for the host to start…</span>
          </div>
          <p className="font-mono text-xs text-ink/40">Code: {code}</p>
        </div>
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

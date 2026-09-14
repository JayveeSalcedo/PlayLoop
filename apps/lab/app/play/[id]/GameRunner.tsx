"use client";

import { buildGameDocument, GAME_FRAME_SANDBOX, type GameMeta, type HostMessage } from "@playloop/runtime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REASON_LABELS, TAMPER_KINDS, type PlayVerdict, type TamperKind } from "@/lib/shared";

type Phase =
  | { name: "loading" }
  | { name: "ready" }
  | { name: "countdown"; label: string }
  | { name: "playing" }
  | { name: "verifying"; claimed: number }
  | { name: "result"; verdict: PlayVerdict }
  | { name: "error"; message: string };

const COUNTDOWN = ["3", "2", "1", "Go"];
const COUNTDOWN_STEP_MS = 620;
const RING = 138.2;

export function GameRunner({
  gameId,
  code,
  meta,
  failedChecks,
  images,
}: {
  gameId: string;
  code: string;
  meta: GameMeta;
  /** Titles of failed game-lab checks; null when checks haven't run. */
  failedChecks: string[] | null;
  /** Creator images by slot id, as data: URLs. */
  images: Record<string, string>;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [hud, setHud] = useState({ score: 0, lives: meta.lives ?? 0, timeLeft: meta.maxSeconds });
  const [tamper, setTamper] = useState<Partial<Record<TamperKind, PlayVerdict | "running" | string>>>({});

  const srcDoc = useMemo(() => buildGameDocument(code), [code]);

  const post = (msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, "*");

  const submit = useCallback(async (msg: Extract<HostMessage, { type: "end" }>) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setPhase({ name: "verifying", claimed: msg.score });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: msg.score, log: msg.log }),
      });
      const data = (await res.json()) as { verdict?: PlayVerdict; error?: string };
      if (!res.ok || !data.verdict) throw new Error(data.error ?? `Verification failed (${res.status}).`);
      setPhase({ name: "result", verdict: data.verdict });
    } catch (e) {
      setPhase({ name: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only the game frame; and even its messages are untrusted — the server decides.
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as HostMessage;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "ready":
          setPhase((p) => (p.name === "loading" ? { name: "ready" } : p));
          break;
        case "hud":
          setHud({ score: Number(msg.score) || 0, lives: Number(msg.lives) || 0, timeLeft: Number(msg.timeLeft) || 0 });
          break;
        case "end":
          void submit(msg);
          break;
        case "error":
          setPhase({ name: "error", message: `${msg.stage}${msg.tick !== undefined ? ` (tick ${msg.tick})` : ""}: ${msg.message}` });
          break;
      }
    };
    window.addEventListener("message", onMessage);
    // If the frame loaded before this listener existed, ask it to repeat its ready message.
    frameRef.current?.contentWindow?.postMessage({ type: "hello" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [submit, attempt]);

  async function start() {
    setTamper({});
    setHud({ score: 0, lives: meta.lives ?? 0, timeLeft: meta.maxSeconds });
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = (await res.json()) as { sessionId?: string; seed?: string; error?: string };
      if (!res.ok || !data.sessionId || !data.seed) throw new Error(data.error ?? "Couldn't start a play session.");
      sessionRef.current = data.sessionId;
      for (let i = 0; i < COUNTDOWN.length; i++) {
        setPhase({ name: "countdown", label: COUNTDOWN[i]! });
        await new Promise((r) => setTimeout(r, COUNTDOWN_STEP_MS));
      }
      setPhase({ name: "playing" });
      post({ type: "start", seed: data.seed, images });
      frameRef.current?.focus();
    } catch (e) {
      setPhase({ name: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function playAgain() {
    sessionRef.current = null;
    setPhase({ name: "loading" });
    setAttempt((n) => n + 1);
  }

  function quit() {
    post({ type: "quit" });
    router.push("/");
  }

  async function runTamper(kind: TamperKind) {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setTamper((t) => ({ ...t, [kind]: "running" }));
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tamper`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = (await res.json()) as { verdict?: PlayVerdict; error?: string };
      setTamper((t) => ({ ...t, [kind]: data.verdict ?? data.error ?? "Failed" }));
    } catch (e) {
      setTamper((t) => ({ ...t, [kind]: e instanceof Error ? e.message : String(e) }));
    }
  }

  const total = meta.maxSeconds;
  const ringOffset = (RING * (1 - Math.max(0, Math.min(1, hud.timeLeft / total)))).toFixed(1);

  return (
    <main className="ghost lab-player">
      <div className="ghud">
        <button className="gx" aria-label="Quit game" type="button" onClick={quit}>
          ✕
        </button>
        <div className={`gtimer ${hud.timeLeft <= 5 && phase.name === "playing" ? "low" : ""}`} aria-label={`${Math.ceil(hud.timeLeft)} seconds left`}>
          <svg viewBox="0 0 54 54" aria-hidden="true">
            <circle className="tb" cx="27" cy="27" r="22" fill="none" strokeWidth="5" />
            <circle className="tf" cx="27" cy="27" r="22" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={ringOffset} />
          </svg>
          <b>{Math.ceil(hud.timeLeft)}</b>
        </div>
        <div className="gscore">
          <small>{meta.lives ? `${"♥".repeat(hud.lives)}${"♡".repeat(Math.max(0, meta.lives - hud.lives))}` : "Score"}</small>
          <b>{hud.score.toLocaleString("en-US")}</b>
        </div>
      </div>

      <div className="gstage">
        <iframe
          key={attempt}
          ref={frameRef}
          className="lab-frame"
          title={`${meta.title} game`}
          sandbox={GAME_FRAME_SANDBOX}
          srcDoc={srcDoc}
          allow=""
          referrerPolicy="no-referrer"
          onLoad={() => post({ type: "hello" })}
        />

        <div className={`gcount ${phase.name === "countdown" ? "on" : ""}`} aria-live="assertive">
          {phase.name === "countdown" ? <span key={phase.label}>{phase.label}</span> : null}
        </div>

        {phase.name === "loading" ? (
          <div className="lab-overlay">
            <p className="font-extrabold">Loading the game…</p>
          </div>
        ) : null}

        {phase.name === "ready" ? (
          <div className="lab-overlay">
            <div className="lab-panel flex flex-col gap-3">
              <h1 className="text-2xl font-extrabold">{meta.title}</h1>
              <p className="font-semibold text-soft">{meta.hint}</p>
              <p className="text-xs font-bold text-soft">
                Your inputs are recorded while you play. When the game ends, the server replays them to check the score.
              </p>
              {failedChecks === null ? (
                <Link href={`/games/${gameId}/report`} className="text-xs font-bold text-soft underline">
                  Game checks haven&apos;t run yet
                </Link>
              ) : failedChecks.length > 0 ? (
                <Link href={`/games/${gameId}/report`} className="chip bad self-start whitespace-normal">
                  Failed checks: {failedChecks.join(", ")}. Scores may not verify.
                </Link>
              ) : (
                <Link href={`/games/${gameId}/report`} className="chip ok self-start">
                  ✓ Passed game checks
                </Link>
              )}
              {meta.imageSlots?.length ? (
                <Link href={`/games/${gameId}/images`} className="text-xs font-bold text-soft underline">
                  Images: {Object.keys(images).length} of {meta.imageSlots.length} added. Add or change them
                </Link>
              ) : null}
              <button className="btn go block" type="button" onClick={start} autoFocus>
                Start
              </button>
            </div>
          </div>
        ) : null}

        {phase.name === "verifying" ? (
          <div className="lab-overlay">
            <div className="lab-panel flex flex-col gap-2 text-center">
              <p className="text-lg font-extrabold">Game over: {phase.claimed.toLocaleString("en-US")}</p>
              <p className="font-semibold text-soft">The server is replaying your inputs…</p>
            </div>
          </div>
        ) : null}

        {phase.name === "result" ? (
          <div className="lab-overlay">
            <ResultPanel verdict={phase.verdict} tamper={tamper} onTamper={runTamper} onAgain={playAgain} />
          </div>
        ) : null}

        {phase.name === "error" ? (
          <div className="lab-overlay">
            <div className="lab-panel flex flex-col gap-3">
              <span className="chip bad self-start">The game stopped</span>
              <p className="break-words font-mono text-sm">{phase.message}</p>
              <div className="flex gap-2">
                <button className="btn go flex-1" type="button" onClick={playAgain}>
                  Try again
                </button>
                <Link href="/" className="btn flex-1">
                  All games
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ResultPanel({
  verdict,
  tamper,
  onTamper,
  onAgain,
}: {
  verdict: PlayVerdict;
  tamper: Partial<Record<TamperKind, PlayVerdict | "running" | string>>;
  onTamper: (kind: TamperKind) => void;
  onAgain: () => void;
}) {
  return (
    <div className="lab-panel flex flex-col gap-4">
      {verdict.ok ? (
        <>
          <span className="chip ok self-start">✓ Verified by replay</span>
          <p className="text-4xl font-extrabold tabular-nums">{verdict.score.toLocaleString("en-US")}</p>
          <dl className="lab-rows">
            <dt>Game time</dt>
            <dd>
              {(verdict.ticks / 60).toFixed(1)} s ({verdict.ticks} ticks)
            </dd>
            <dt>Ended by</dt>
            <dd>{verdict.endReason.replace("_", " ")}</dd>
            <dt>Server replay</dt>
            <dd>{verdict.verifyMs} ms</dd>
            <dt>Would pay</dt>
            <dd>{verdict.payoutPreview} pts (calibration)</dd>
          </dl>
        </>
      ) : (
        <>
          <span className="chip bad self-start">✗ Rejected</span>
          <p className="text-xl font-extrabold">{REASON_LABELS[verdict.reason] ?? verdict.reason}</p>
          <p className="text-sm font-semibold text-soft">{verdict.detail}</p>
          <dl className="lab-rows">
            <dt>Browser said</dt>
            <dd>{verdict.claimedScore}</dd>
            {verdict.replayScore !== undefined ? (
              <>
                <dt>Replay produced</dt>
                <dd>{verdict.replayScore}</dd>
              </>
            ) : null}
            <dt>Would pay</dt>
            <dd>0 pts</dd>
          </dl>
        </>
      )}

      {verdict.ok ? (
        <div className="flex flex-col gap-2 border-t-2 border-paper pt-3">
          <p className="text-sm font-extrabold">Try to cheat with this play</p>
          <p className="text-xs font-semibold text-soft">Each button re-sends your real play with one thing forged. Nothing is saved.</p>
          {TAMPER_KINDS.map(({ kind, label }) => {
            const state = tamper[kind];
            return (
              <div key={kind} className="flex items-center justify-between gap-2">
                <button className="btn sm" type="button" onClick={() => onTamper(kind)} disabled={state === "running"}>
                  {label}
                </button>
                <span className="text-right text-xs font-bold">
                  {state === undefined ? null : state === "running" ? (
                    "Checking…"
                  ) : typeof state === "string" ? (
                    state
                  ) : state.ok ? (
                    <span className="chip ok">Accepted?!</span>
                  ) : (
                    <span className="chip bad" title={state.detail}>
                      {REASON_LABELS[state.reason] ?? state.reason}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button className="btn go flex-1" type="button" onClick={onAgain}>
          Play again
        </button>
        <Link href="/" className="btn flex-1">
          All games
        </Link>
      </div>
    </div>
  );
}

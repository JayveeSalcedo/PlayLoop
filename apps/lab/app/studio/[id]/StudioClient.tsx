"use client";

import { buildGameDocument, GAME_FRAME_SANDBOX, type HostMessage, type ImageSlot } from "@playloop/runtime";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiJobProgress } from "@/app/_components/AiJob";
import { ImageEditor } from "@/app/games/[id]/images/ImageEditor";

async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

/** Shows an AI job's progress and refreshes the page when it finishes (the server attaches the new version). */
export function PendingJob({ jobId }: { jobId: string }) {
  const router = useRouter();
  return <AiJobProgress jobId={jobId} hideLinks onFinished={() => router.refresh()} />;
}

/** Unrecorded play inside the sandbox, for trying changes quickly. */
export function PracticePlayer({ code, images, maxSeconds }: { code: string; images: Record<string, string>; maxSeconds: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "playing" | "over" | "error">("loading");
  const [hud, setHud] = useState({ score: 0, timeLeft: maxSeconds });
  const [message, setMessage] = useState<string | null>(null);
  const srcDoc = useMemo(() => buildGameDocument(code), [code]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as HostMessage;
      if (msg?.type === "ready") setPhase((p) => (p === "loading" ? "ready" : p));
      else if (msg?.type === "hud") setHud({ score: Number(msg.score) || 0, timeLeft: Number(msg.timeLeft) || 0 });
      else if (msg?.type === "end") {
        setHud((h) => ({ ...h, score: Number(msg.score) || 0 }));
        setPhase("over");
      } else if (msg?.type === "error") {
        setMessage(msg.message);
        setPhase("error");
      }
    };
    window.addEventListener("message", onMessage);
    frameRef.current?.contentWindow?.postMessage({ type: "hello" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [round]);

  function play() {
    setHud({ score: 0, timeLeft: maxSeconds });
    frameRef.current?.contentWindow?.postMessage({ type: "start", seed: crypto.randomUUID(), images }, "*");
    frameRef.current?.focus();
    setPhase("playing");
  }

  function again() {
    setPhase("loading");
    setRound((r) => r + 1);
  }

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-2xl bg-night [border:var(--border-thick)] [box-shadow:var(--shadow-hard)]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2 text-sm font-extrabold text-white">
        <span className="tabular-nums">{Math.ceil(hud.timeLeft)} s</span>
        <span className="tabular-nums">{hud.score.toLocaleString("en-US")}</span>
      </div>
      <iframe
        key={round}
        ref={frameRef}
        title="Practice play"
        sandbox={GAME_FRAME_SANDBOX}
        srcDoc={srcDoc}
        onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "hello" }, "*")}
        className="absolute inset-0 h-full w-full border-0 pt-9"
      />
      {phase !== "playing" ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-night/70 p-4 text-center text-white">
          {phase === "loading" ? (
            <p className="font-extrabold">Loading…</p>
          ) : phase === "ready" ? (
            <button type="button" className="btn go" onClick={play}>
              ▶ Practice play
            </button>
          ) : phase === "over" ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-2xl font-extrabold">Score {hud.score.toLocaleString("en-US")}</p>
              <button type="button" className="btn go" onClick={again}>
                Play again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="font-bold">The game stopped: {message}</p>
              <button type="button" className="btn go" onClick={again}>
                Try again
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ImagesPanel({ gameId, code, slots, images }: { gameId: string; code: string; slots: ImageSlot[]; images: Record<string, string> }) {
  const router = useRouter();
  return <ImageEditor gameId={gameId} code={code} slots={slots} initialImages={images} showGamePreview={false} onChange={() => router.refresh()} />;
}

const CHANGE_IDEAS = ["Make it harder after 20 seconds", "Add a bonus round at the end", "Use bigger, easier targets", "Change the colours to night mode"];

export function ChangePanel({ projectId, pendingJobId, canFix }: { projectId: string; pendingJobId: string | null; canFix: boolean }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(pendingJobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { instruction: string } | { fix: true }) {
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/projects/${projectId}/change`, body);
      setJobId(String(data.jobId));
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (jobId) {
    return (
      <AiJobProgress
        jobId={jobId}
        hideLinks
        onFinished={() => {
          setJobId(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <label htmlFor="studio-change" className="font-extrabold">
        Tell the AI what to change
      </label>
      <textarea
        id="studio-change"
        className="min-h-20 w-full resize-y rounded-xl bg-paper p-3 font-semibold [border:var(--border-thick)]"
        placeholder="e.g. Make the coins worth more and add a 10 second countdown at the end"
        maxLength={1000}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {CHANGE_IDEAS.map((idea) => (
          <button key={idea} type="button" className="chip bg-card" onClick={() => setInstruction(idea)}>
            {idea}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="font-bold text-gum">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn go sm" disabled={busy || !instruction.trim()} onClick={() => send({ instruction })}>
          Make this change
        </button>
        {canFix ? (
          <button type="button" className="btn sm" disabled={busy} onClick={() => send({ fix: true })}>
            Fix what the checks found
          </button>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-soft">Each change becomes a new version, checked by bots. You can always go back.</p>
    </div>
  );
}

export interface VersionRow {
  n: number;
  label: string;
  via: string;
  title: string;
  verdict: "pass" | "fail" | null;
  at: string;
}

export function VersionList({ projectId, current, rows }: { projectId: string; current: number | null; rows: VersionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function use(n: number) {
    setBusy(n);
    setError(null);
    try {
      await post(`/api/projects/${projectId}/version`, { n });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="font-bold text-gum">
          {error}
        </p>
      ) : null}
      <ol className="card divide-y-2 divide-paper">
        {rows.map((row) => (
          <li key={row.n} className={`flex flex-wrap items-center justify-between gap-3 p-3 ${row.n === current ? "bg-lemon/30" : ""}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b>v{row.n}</b>
                <span className="text-xs font-bold text-soft">{row.via}</span>
                {row.verdict ? <span className={row.verdict === "pass" ? "chip ok" : "chip bad"}>{row.verdict === "pass" ? "✓ checks" : "✗ checks"}</span> : null}
              </div>
              <p className="line-clamp-2 text-sm font-semibold">{row.label}</p>
            </div>
            {row.n === current ? (
              <span className="chip info">Current</span>
            ) : (
              <button type="button" className="btn sm" disabled={busy !== null} onClick={() => use(row.n)}>
                {busy === row.n ? "Switching…" : row.n < (current ?? 0) ? "Go back to this" : "Use this"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SubmitButton({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn go block"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post(`/api/projects/${projectId}/submit`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : "Send for review"}
      </button>
      {disabled ? <p className="text-sm font-semibold text-soft">Finish the items above to send it.</p> : null}
      {error ? (
        <p role="alert" className="font-bold text-gum">
          {error}
        </p>
      ) : null}
    </div>
  );
}

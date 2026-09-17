"use client";

/**
 * A moderator's sandboxed playthrough of a pending code-game version.
 *
 * Deliberately not a play session: no server round trip, no seed pinned by
 * startPlay, no submission, nothing recorded. The lab report (shown alongside
 * this) already proved the game is safe, deterministic and mechanically sound
 * before it ever reached the queue — what a machine check cannot judge is
 * content: is this appropriate, does it match its title, is it brand-safe.
 * That's what this is for, and the only way to judge it is to actually play
 * the exact version, not read its source.
 *
 * Runs in the same sandboxed iframe a player gets (buildGameDocument,
 * sandbox="allow-scripts", no allow-same-origin, CSP with no network) — the
 * reviewer's browser executes the same untrusted code the same way.
 */
import { buildGameDocument, GAME_FRAME_SANDBOX, type GameMeta, type HostMessage } from "@playloop/runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";

type Phase = "loading" | "idle" | "playing" | "ended" | "load-error" | "run-error";

export function ReviewGamePreview({ code, runtimeVersion, meta }: { code: string; runtimeVersion: number; meta: GameMeta }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [hud, setHud] = useState({ score: 0, lives: meta.lives ?? 0, timeLeft: meta.maxSeconds });
  const [ended, setEnded] = useState<{ score: number; endReason: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // The exact version's runtime, the same one the server would replay it
  // under — not necessarily the current one, if a runtime bump has happened
  // since this version was written. Doesn't depend on `attempt`: the iframe's
  // own `key={attempt}` is what forces a fresh instance on replay, not this.
  const srcDoc = useMemo(() => buildGameDocument(code, runtimeVersion), [code, runtimeVersion]);
  const post = (msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, "*");

  // Subscribes to the current iframe instance's messages; each replay mounts a
  // new iframe (key={attempt}), so the listener is re-attached to match. State
  // resets happen in the handlers that trigger those transitions (replay(),
  // play()), not synchronously here.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const msg = event.data as HostMessage;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "ready":
          setPhase((p) => (p === "loading" ? "idle" : p));
          break;
        case "hud":
          setHud({ score: Number(msg.score) || 0, lives: Number(msg.lives) || 0, timeLeft: Number(msg.timeLeft) || 0 });
          break;
        case "end":
          setEnded({ score: msg.score, endReason: msg.endReason });
          setPhase("ended");
          break;
        case "error":
          setErrorMessage(`${msg.stage}${msg.tick !== undefined ? ` (tick ${msg.tick})` : ""}: ${msg.message}`);
          setPhase(msg.stage === "load" ? "load-error" : "run-error");
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [attempt]);

  function play() {
    setHud({ score: 0, lives: meta.lives ?? 0, timeLeft: meta.maxSeconds });
    setEnded(null);
    setPhase("playing");
    // Not a real session — nothing is scored or recorded, so any seed will do.
    post({ type: "start", seed: crypto.randomUUID().replace(/-/g, ""), images: {} });
  }

  function replay() {
    setPhase("loading");
    setErrorMessage(null);
    setEnded(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="rounded-2xl bg-paper p-3 [border:var(--border-thick)]">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-xl bg-night [border:var(--border-thick)]">
        <iframe
          key={attempt}
          ref={frameRef}
          className="absolute inset-0 h-full w-full border-0"
          title="Moderator preview"
          sandbox={GAME_FRAME_SANDBOX}
          srcDoc={srcDoc}
          allow=""
          referrerPolicy="no-referrer"
          onLoad={() => post({ type: "hello" })}
        />
        {phase === "playing" ? (
          <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-extrabold text-white">
            {hud.score.toLocaleString("en-US")} · {Math.ceil(hud.timeLeft)}s
          </div>
        ) : null}
        {phase === "loading" ? (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner size={28} className="text-lemon" />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex min-h-[32px] items-center justify-between gap-2">
        {phase === "idle" ? (
          <button className="btn go sm" type="button" onClick={play}>
            Play preview
          </button>
        ) : phase === "ended" ? (
          <>
            <p className="text-xs font-bold text-soft">
              Ended ({ended!.endReason.replace(/_/g, " ")}), scored {ended!.score.toLocaleString("en-US")}
            </p>
            <button className="btn sm" type="button" onClick={replay}>
              Play again
            </button>
          </>
        ) : phase === "load-error" || phase === "run-error" ? (
          <>
            <p className="text-xs font-bold text-gum">
              {phase === "load-error" ? "Didn't load: " : "Stopped: "}
              {errorMessage}
            </p>
            <button className="btn sm" type="button" onClick={replay}>
              Try again
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

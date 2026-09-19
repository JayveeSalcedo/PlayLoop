"use client";

/**
 * Plays a code game: AI-written (or hand-written) JavaScript running in a
 * sandboxed iframe, scored by the server replaying what the player did.
 *
 * The frame is untrusted. It gets sandbox="allow-scripts" with no
 * allow-same-origin — an opaque origin, so no cookies, storage or access to this
 * page — and a CSP that blocks the network (see buildGameDocument). Its
 * messages are treated as claims: the score it reports at the end is sent to
 * the server alongside the recorded inputs, and the server decides what it's
 * worth by replaying them.
 *
 * Flow: load the frame and wait for it to report the game loaded → open a
 * session (the server pins the version and picks the seed) → countdown → start
 * the frame with that seed → on end, submit score + input log → result.
 */
import { buildGameDocument, GAME_FRAME_SANDBOX, type GameMeta, type HostMessage } from "@playloop/runtime";
import { artSVG, icon, type ThemeName } from "@playloop/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { SuccessModal } from "@/app/_components/SuccessModal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTestPlay } from "@/app/(app)/create/studio/actions";
import type { PlayResult } from "@/lib/creditPlay";
import { startChallengedPlay, startPlay } from "./actions";
import { PlayIntro } from "./PlayIntro";
import { PlayResultScreen } from "./PlayResultScreen";

export interface CodeGameRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  difficulty: "Easy" | "Medium" | "Hard";
  maxPoints: number;
  status: "draft" | "pending_review" | "published" | "rejected";
  coverImage?: string | null;
}

/** The version the page loaded. startPlay refuses if the game has moved on since, rather than replaying a different version. */
export interface CodeGameVersion {
  id: string;
  code: string;
  runtimeVersion: number;
  meta: GameMeta;
}

type Stage =
  | { name: "intro" }
  | { name: "loading" }
  | { name: "countdown"; label: string }
  | { name: "playing" }
  | { name: "verifying" }
  | { name: "result"; result: PlayResult; sessionId: string }
  | { name: "tested"; score: number };

const COUNTDOWN = ["3", "2", "1", "Go"];
/** Same beat as the template engine's countdown (runGame: 620 ms per step). */
const COUNTDOWN_STEP_MS = 620;
const RING = 138.2;
/** A game that hasn't reported loading by now isn't going to. */
const LOAD_TIMEOUT_MS = 15_000;

export function CodeGamePlayer({
  game,
  version,
  challengeCode,
  test,
}: {
  game: CodeGameRow;
  version: CodeGameVersion | null;
  challengeCode?: string;
  /**
   * A creator's studio test play of this version: verified by replay exactly
   * like a real play, never credited. Its verified result is what lets them
   * submit the version.
   */
  test?: { backHref: string };
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "intro" });
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState({ score: 0, lives: 0, timeLeft: 0 });
  const [attempt, setAttempt] = useState(0);
  const [showVerifiedModal, setShowVerifiedModal] = useState(true);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<string | null>(null);
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null>(null);

  // The same runtime the server will replay this version with — see buildGameDocument.
  const srcDoc = useMemo(() => (version ? buildGameDocument(version.code, version.runtimeVersion) : ""), [version]);

  const post = (msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, "*");

  const backToIntro = useCallback((message: string | null) => {
    post({ type: "quit" });
    sessionRef.current = null;
    setShowVerifiedModal(true);
    setError(message);
    setStage({ name: "intro" });
  }, []);

  const submit = useCallback(
    async (msg: Extract<HostMessage, { type: "end" }>) => {
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      sessionRef.current = null;
      setStage({ name: "verifying" });
      try {
        const res = await fetch(`/api/play/${sessionId}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ score: msg.score, log: msg.log }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<PlayResult> & { error?: string; test?: boolean };
        if (test) {
          if (!res.ok || !data.test) throw new Error(data.error ?? "Couldn't check that test play — try again.");
          setStage({ name: "tested", score: data.score ?? 0 });
          return;
        }
        if (!res.ok || typeof data.payoutPoints !== "number") {
          throw new Error(data.error ?? "Couldn't save that play — try again.");
        }
        setStage({ name: "result", result: data as PlayResult, sessionId });
      } catch (e) {
        backToIntro(e instanceof Error ? e.message : "Couldn't save that play — try again.");
      }
    },
    [backToIntro, test],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only the game frame — and even its messages are claims, not facts.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const msg = event.data as HostMessage;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "ready":
          readyRef.current?.resolve();
          break;
        case "hud":
          setHud({ score: Number(msg.score) || 0, lives: Number(msg.lives) || 0, timeLeft: Number(msg.timeLeft) || 0 });
          break;
        case "end":
          void submit(msg);
          break;
        case "error":
          if (readyRef.current && msg.stage === "load") readyRef.current.reject(new Error("This game couldn't load."));
          else backToIntro("The game stopped unexpectedly, so that play wasn't counted.");
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [submit, backToIntro]);

  async function start() {
    if (!version) return;
    setError(null);

    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timer = setTimeout(() => reject(new Error("This game took too long to load.")), LOAD_TIMEOUT_MS);
    readyRef.current = { promise, resolve, reject };

    setHud({ score: 0, lives: version.meta.lives ?? 0, timeLeft: version.meta.maxSeconds });
    setAttempt((n) => n + 1); // a fresh frame per play: game state never carries over
    setStage({ name: "loading" });

    try {
      // Load first, then open the session: a game that can't load shouldn't
      // start a session the player then can't finish.
      await promise;
      clearTimeout(timer);
      readyRef.current = null;

      const { sessionId, seed } = test
        ? await startTestPlay(version.id)
        : challengeCode
          ? await startChallengedPlay(game.id, challengeCode, version.id)
          : await startPlay(game.id, version.id);
      if (!seed) throw new Error("Couldn't start that game — try again.");
      sessionRef.current = sessionId;

      for (const label of COUNTDOWN) {
        setStage({ name: "countdown", label });
        await new Promise((r) => setTimeout(r, COUNTDOWN_STEP_MS));
      }
      setStage({ name: "playing" });
      post({ type: "start", seed, images: {} });
      frameRef.current?.focus();
    } catch (e) {
      clearTimeout(timer);
      readyRef.current = null;
      backToIntro(e instanceof Error ? e.message : "Couldn't start that game — check your connection and try again.");
    }
  }

  if (stage.name === "result") {
    return (
      <PlayResultScreen
        title={game.title}
        result={stage.result}
        sessionId={stage.sessionId}
        challengeCode={challengeCode}
        onPlayAgain={() => backToIntro(null)}
      />
    );
  }

  if (stage.name === "tested" && test) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        {game.coverImage ? (
          <div className="card-hard mb-4 overflow-hidden rounded-2xl [border:var(--border-thick)] aspect-[16/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={game.coverImage} alt={game.title} className="h-full w-full object-cover" />
          </div>
        ) : null}
        <p className="font-bold text-soft">Test play verified</p>
        <div className="my-2 text-7xl font-extrabold tracking-tight text-ink">{stage.score}</div>
        <p className="text-sm font-bold text-soft">The server replayed your inputs and got the same score. Test plays earn no points.</p>
        <div className="mt-6 flex gap-3">
          <Link href={test.backHref} className="btn go flex-1">
            Back to the studio
          </Link>
          <button onClick={() => backToIntro(null)} className="btn flex-1">
            Test again
          </button>
        </div>

        <SuccessModal
          isOpen={showVerifiedModal}
          onClose={() => setShowVerifiedModal(false)}
          title="⚡ Game Verified & Ready for Review!"
          badgeText="Server Determinism Passed"
          iconHtml={icon("check")}
          accentColor="mint"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Submit for Review (Studio)",
            onClick: () => {
              router.push(test.backHref);
            },
          }}
          secondaryAction={{
            label: "Test Again",
            onClick: () => backToIntro(null),
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <div className="flex justify-between items-center text-xs font-bold text-soft">
                <span>Verified Replay Score</span>
                <span className="text-xl font-black text-ink">{stage.score}</span>
              </div>
              <p className="mt-1 text-xs text-soft font-medium">
                Server deterministically reproduced your inputs with 0 desync errors.
              </p>
            </div>
            <div className="rounded-2xl bg-mint/25 p-3 border-2 border-ink text-xs font-semibold text-ink">
              🔓 <span className="font-extrabold">Review Gate Unlocked:</span> This version has satisfied the mandatory test play requirement and can now be submitted to moderation.
            </div>
          </div>
        </SuccessModal>
      </main>
    );
  }

  if (stage.name === "intro" || !version) {
    return (
      <PlayIntro
        artHtml={artSVG(null, game.theme as ThemeName)}
        title={game.title}
        difficulty={game.difficulty}
        maxPoints={game.maxPoints}
        description={version?.meta.hint ?? game.description}
        status={game.status}
        error={version ? error : "This game isn't ready to play yet."}
        starting={false}
        onStart={start}
        testMode={!!test}
        coverImage={game.coverImage}
      />
    );
  }

  const meta = version.meta;
  const ringOffset = (RING * (1 - Math.max(0, Math.min(1, hud.timeLeft / meta.maxSeconds)))).toFixed(1);

  return (
    <div className="ghost code-player" style={{ position: "fixed", inset: 0 }}>
      <div className="ghud">
        <button className="gx" aria-label="Quit game" type="button" onClick={() => backToIntro(null)}>
          ✕
        </button>
        <div className={`gtimer ${hud.timeLeft <= 5 && stage.name === "playing" ? "low" : ""}`} aria-label={`${Math.ceil(hud.timeLeft)} seconds left`}>
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
          className="code-frame"
          title={`${game.title} game`}
          sandbox={GAME_FRAME_SANDBOX}
          srcDoc={srcDoc}
          allow=""
          referrerPolicy="no-referrer"
          // The frame keeps its load result and repeats it on hello, in case it
          // finished loading before the listener above existed.
          onLoad={() => post({ type: "hello" })}
        />

        <div className={`gcount ${stage.name === "countdown" ? "on" : ""}`} aria-live="assertive">
          {stage.name === "countdown" ? <span key={stage.label}>{stage.label}</span> : null}
        </div>

        {stage.name === "loading" || stage.name === "verifying" ? (
          <div className="code-overlay">
            <Spinner size={64} className="text-lemon" />
            <p className="text-sm font-bold">{stage.name === "loading" ? "Loading the game…" : "Checking your play…"}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

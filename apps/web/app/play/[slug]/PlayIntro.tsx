"use client";

import { icon, type GameArtType } from "@playloop/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PlayLogoCta } from "@/app/_components/brand/PlayLogoCta";
import { HowToPlayModal } from "./HowToPlayModal";

/**
 * The page before a play: cover, title, what it pays, and the logo CTA.
 * Shared by the template player and the code-game player.
 */
export function PlayIntro({
  artHtml,
  title,
  difficulty,
  maxPoints,
  description,
  status,
  error,
  starting,
  onStart,
  testMode = false,
  coverImage,
  gameType,
  codeHint,
  instructionsKey,
}: {
  artHtml: string;
  title: string;
  difficulty: string;
  maxPoints: number;
  description: string;
  status: "draft" | "pending_review" | "published" | "rejected";
  error: string | null;
  starting: boolean;
  onStart: () => void;
  /** A creator's studio test play: playable whatever the game's status, and says it pays nothing. */
  testMode?: boolean;
  coverImage?: string | null;
  /** Which template's "how to play" content to show; null for a code game (no fixed mechanics). */
  gameType: GameArtType | null;
  /** A code game's own meta.hint, shown in the instructions modal in place of template steps. */
  codeHint?: string;
  /** Dedupe key for "has this player already seen the instructions for this game" — a template type, or `code:<slug>` for a code game. */
  instructionsKey: string;
}) {
  // Only the creator can reach an unpublished game (the page 404s for everyone
  // else), so this banner is always addressed to them.
  const awaitingReview = !testMode && status !== "published";

  const [showHowTo, setShowHowTo] = useState(false);
  useEffect(() => {
    const key = `playloop_seen_howto_${instructionsKey}`;
    try {
      if (!localStorage.getItem(key)) {
        setShowHowTo(true);
        localStorage.setItem(key, "1");
      }
    } catch {
      // Private browsing or storage disabled — the game is still playable,
      // it just won't auto-show; the "How to play" button still works.
    }
  }, [instructionsKey]);

  return (
    <main className="mx-auto max-w-sm p-6">
      <div className="card-hard overflow-hidden rounded-3xl [border:var(--border-thick)] aspect-[16/9]">
        {coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverImage} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: artHtml }} />
        )}
      </div>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold text-soft">
        <span>{difficulty}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1 font-extrabold text-ink">
          <span className="coin sm" aria-hidden="true" />
          win up to {maxPoints} pts
        </span>
      </div>
      <p className="mt-3 text-soft">{description}</p>
      <button
        type="button"
        onClick={() => setShowHowTo(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-soft hover:text-ink"
      >
        <span dangerouslySetInnerHTML={{ __html: icon("book") }} />
        How to play
      </button>
      {awaitingReview ? (
        <div className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="font-extrabold">
            {status === "rejected" ? "Not approved" : status === "draft" ? "Draft" : "Pending review"}
          </p>
          <p className="mt-1 text-sm font-bold text-soft">
            {status === "rejected"
              ? "This game wasn't approved for the feed, so it can't be played for points."
              : status === "draft"
                ? "Only you can see this draft. Submit it for review when it's ready; it doesn't pay out points until it's approved."
                : "Only you can see this game until it's approved. It isn't in the feed and doesn't pay out points yet."}
          </p>
          <Link href="/create/games" className="btn sm mt-3">
            Back to my games
          </Link>
        </div>
      ) : null}
      {testMode ? (
        <div className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="font-extrabold">Test play</p>
          <p className="mt-1 text-sm font-bold text-soft">
            Your inputs are recorded and the server replays them, exactly like a real play. Nothing is paid. Play to the end
            to be able to submit this version.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
      <PlayLogoCta onStart={onStart} starting={starting} disabled={awaitingReview} />
      <HowToPlayModal
        isOpen={showHowTo}
        onClose={() => setShowHowTo(false)}
        title={title}
        gameType={gameType}
        codeHint={codeHint}
      />
    </main>
  );
}

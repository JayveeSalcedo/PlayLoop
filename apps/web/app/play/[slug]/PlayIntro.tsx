"use client";

import { icon } from "@playloop/ui";
import Link from "next/link";
import { Spinner } from "@/app/_components/Spinner";

/**
 * The page before a play: cover, title, what it pays, and the Play button.
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
}) {
  // Only the creator can reach an unpublished game (the page 404s for everyone
  // else), so this banner is always addressed to them.
  const awaitingReview = !testMode && status !== "published";

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
      <button onClick={onStart} disabled={starting || awaitingReview} className="btn go lg block mt-6">
        {starting ? (
          <>
            <Spinner size={22} /> Starting…
          </>
        ) : (
          <>
            <span dangerouslySetInnerHTML={{ __html: icon("play", "fill") }} /> Play now
          </>
        )}
      </button>
    </main>
  );
}

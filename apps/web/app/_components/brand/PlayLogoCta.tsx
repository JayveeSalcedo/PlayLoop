"use client";

import Image from "next/image";
import { Spinner } from "@/app/_components/Spinner";
import loopWord from "@/public/logo-loop.png";
import playWord from "@/public/logo-play.png";

/**
 * The start-a-play CTA, built out of the logo itself: the "play" half of
 * the wordmark sits inside the button, the "loop" half sits directly under
 * it as plain art, and together they read as the playloop logo — so the
 * moment you commit to a game is the moment the brand mark shows up.
 *
 * Only the "play" half is a button; "loop" is decoration and is hidden
 * from assistive tech, so the button's own label carries the whole thing.
 *
 * The two PNGs are cut from the same source logo and kept at its full
 * width, so rendering both at one width reproduces the horizontal register
 * of the original lockup — change WORDMARK and both halves scale together.
 */
const WORDMARK = 145;
const playHeight = Math.round((WORDMARK * playWord.height) / playWord.width);
const loopHeight = Math.round((WORDMARK * loopWord.height) / loopWord.width);

export function PlayLogoCta({
  onStart,
  starting,
  disabled,
}: {
  onStart: () => void;
  starting: boolean;
  disabled: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col items-center">
      <button onClick={onStart} disabled={starting || disabled} aria-label="Play now" className="btn go lg block">
        {/* Fixed to the wordmark's height so swapping in the spinner doesn't
            resize the button and shift the "loop" half under it. */}
        <span className="flex items-center justify-center gap-2" style={{ height: playHeight }}>
          {starting ? (
            <>
              <Spinner size={22} /> Starting…
            </>
          ) : (
            <Image src={playWord} alt="" width={WORDMARK} height={playHeight} priority />
          )}
        </span>
      </button>
      <Image
        src={loopWord}
        alt=""
        aria-hidden="true"
        width={WORDMARK}
        height={loopHeight}
        priority
        className="mt-1"
      />
    </div>
  );
}

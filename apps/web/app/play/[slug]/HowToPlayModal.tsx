"use client";

import { CODE_GAME_HOW_TO_PLAY, HOW_TO_PLAY, type GameArtType } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";

/**
 * The pre-game "how to play" overlay, mounted by PlayIntro. Purely a
 * read-only explainer — dismissing it (Escape, backdrop, ✕, or "Got it")
 * just closes it and returns to the same intro screen; it never touches
 * onStart or the game clock.
 */
export function HowToPlayModal({
  isOpen,
  onClose,
  title,
  gameType,
  codeHint,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** null for a code game, which has no fixed template/gesture. */
  gameType: GameArtType | null;
  /** The code game's own meta.hint, shown in place of template steps. */
  codeHint?: string;
}) {
  const info = gameType ? HOW_TO_PLAY[gameType] : null;
  const gestureIcon = info?.gestureIcon ?? CODE_GAME_HOW_TO_PLAY.gestureIcon;
  const steps = info?.steps ?? null;
  const extraArt = info?.extraArt;

  return (
    <SuccessModal
      isOpen={isOpen}
      onClose={onClose}
      title="How to play"
      badgeText={title}
      iconHtml={gestureIcon}
      accentColor="lemon"
      confetti={false}
      soundEffect="none"
      primaryAction={{ label: "Got it", onClick: onClose }}
    >
      <div className="flex flex-col gap-3 text-left">
        {extraArt?.length ? (
          <div className="flex justify-center gap-3">
            {extraArt.map((art, i) => (
              <div
                key={i}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-card [border:var(--border-thick)] [&_svg]:h-7 [&_svg]:w-7"
                dangerouslySetInnerHTML={{ __html: art }}
              />
            ))}
          </div>
        ) : null}
        {steps ? (
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-black text-sky">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        ) : codeHint ? (
          <p className="font-bold text-soft">{codeHint}</p>
        ) : null}
      </div>
    </SuccessModal>
  );
}

"use client";

import React, { useEffect, useId } from "react";
import confetti from "canvas-confetti";
import { arenaAudio } from "@/lib/arenaAudio";

export interface SuccessModalAction {
  label: string;
  onClick: () => void | Promise<void>;
  iconHtml?: string;
  className?: string;
  disabled?: boolean;
}

export interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badgeText?: string;
  iconHtml?: string;
  accentColor?: "mint" | "lemon" | "cyan" | "gum";
  confetti?: boolean;
  soundEffect?: "victory" | "tap" | "none";
  children: React.ReactNode;
  primaryAction?: SuccessModalAction;
  secondaryAction?: SuccessModalAction;
  className?: string;
}

export function SuccessModal({
  isOpen,
  onClose,
  title,
  badgeText,
  iconHtml,
  accentColor = "lemon",
  confetti: shouldConfetti = true,
  soundEffect = "victory",
  children,
  primaryAction,
  secondaryAction,
  className = "",
}: SuccessModalProps) {
  const titleId = useId();

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  // Play sound effect on open
  useEffect(() => {
    if (!isOpen) return;
    try {
      if (soundEffect === "victory") {
        arenaAudio.playVictory();
      } else if (soundEffect === "tap") {
        arenaAudio.playTap();
      }
    } catch {
      // AudioContext failure gracefully handled
    }
  }, [isOpen, soundEffect]);

  // Fire celebratory confetti burst
  useEffect(() => {
    if (!isOpen || !shouldConfetti) return;
    try {
      confetti({
        particleCount: 80,
        spread: 65,
        origin: { y: 0.6 },
        colors: ["#FFDD3C", "#3FC8FF", "#FF5FA2", "#22D39B", "#FF7A1A", "#111111"],
        disableForReducedMotion: true,
        zIndex: 200,
      });
    } catch {
      // ignore
    }
  }, [isOpen, shouldConfetti]);

  if (!isOpen) return null;

  const accentBadgeClasses: Record<string, string> = {
    mint: "bg-mint text-ink",
    lemon: "bg-lemon text-ink",
    cyan: "bg-cyan text-ink",
    gum: "bg-gum text-ink",
  };

  const primaryBtnAccent: Record<string, string> = {
    mint: "bg-mint text-ink hover:brightness-95",
    lemon: "bg-lemon text-ink hover:brightness-95",
    cyan: "bg-cyan text-ink hover:brightness-95",
    gum: "bg-gum text-ink hover:brightness-95",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`card-hard relative flex max-h-[92vh] w-full max-w-md flex-col items-center overflow-y-auto rounded-3xl bg-card p-6 text-center text-ink [border:var(--border-thick)] shadow-brutal animate-in zoom-in-95 duration-150 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-paper font-black text-ink transition-transform hover:bg-card active:scale-90 cursor-pointer shadow-hard-sm"
        >
          ✕
        </button>

        {/* Optional Badge */}
        {badgeText ? (
          <div
            className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider border-2 border-ink shadow-hard-sm ${accentBadgeClasses[accentColor] ?? "bg-lemon text-ink"}`}
          >
            {badgeText}
          </div>
        ) : null}

        {/* Optional Icon Header */}
        {iconHtml ? (
          <div
            className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl [border:var(--border-thick)] shadow-hard-sm text-2xl ${accentBadgeClasses[accentColor] ?? "bg-lemon text-ink"}`}
            dangerouslySetInnerHTML={{ __html: iconHtml }}
          />
        ) : null}

        {/* Modal Title */}
        <h2 id={titleId} className="mb-2 text-2xl font-black tracking-tight text-ink">
          {title}
        </h2>

        {/* Modal Body / Custom Payload */}
        <div className="w-full my-2 text-sm font-medium leading-relaxed text-ink/90">
          {children}
        </div>

        {/* Actions */}
        {(primaryAction || secondaryAction) && (
          <div className="mt-5 flex w-full flex-col gap-2.5">
            {primaryAction && (
              <button
                type="button"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl [border:var(--border-thick)] py-3.5 px-5 font-black text-base shadow-hard-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${primaryAction.className || primaryBtnAccent[accentColor] || "bg-lemon text-ink"}`}
              >
                {primaryAction.iconHtml ? (
                  <span dangerouslySetInnerHTML={{ __html: primaryAction.iconHtml }} />
                ) : null}
                <span>{primaryAction.label}</span>
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
                className={`w-full cursor-pointer rounded-xl border-2 border-ink bg-paper py-2.5 px-4 text-sm font-extrabold text-ink transition-all hover:bg-card active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${secondaryAction.className || ""}`}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

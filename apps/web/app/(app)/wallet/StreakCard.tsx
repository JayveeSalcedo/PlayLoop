"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { icon } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";

/**
 * 7-day streak card matching the prototype's .streak / .sdays design.
 * Thick border, rounded corners, flame icons on active days.
 */

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function StreakCard({ streak, playedToday }: { streak: number; playedToday: boolean }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const jsDay = new Date().getDay(); // 0=Sun
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
  const nextMilestone = streak < 3 ? 3 : streak < 7 ? 7 : streak < 14 ? 14 : streak + 7;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (streak > 0) setShowModal(true);
        }}
        className={`mt-3 rounded-[18px] bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)] ${streak > 0 ? "cursor-pointer hover:brightness-95 transition-all" : ""}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1 font-extrabold">
          <span className="text-[15px] flex items-center gap-1.5">
            {streak > 0 ? (
              <>
                <span dangerouslySetInnerHTML={{ __html: icon("flame") }} className="text-lemon" />
                <span>{streak}-day streak</span>
              </>
            ) : (
              "No streak yet"
            )}
          </span>
          <span className="text-[13px] font-semibold text-soft">
            {streak === 0
              ? "Play a game to start"
              : playedToday
                ? "Today counted ✓"
                : "Play today to keep it"}
          </span>
        </div>
      <div className="mt-2.5 grid grid-cols-7 gap-1">
        {DAYS.map((d, i) => {
          const daysAgo = (todayIdx - i + 7) % 7;
          const lit =
            (playedToday && daysAgo < streak) || (!playedToday && daysAgo > 0 && daysAgo <= streak);
          const isToday = i === todayIdx;

          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-bold ${isToday && !lit ? "bg-paper" : ""}`}
            >
              <span
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-xs ${
                  lit
                    ? "bg-lemon [border:2.5px_solid_var(--ink)]"
                    : isToday
                      ? "bg-paper [border:2px_dashed_var(--ink)]"
                      : "bg-paper [border:2px_solid_rgba(24,18,63,.12)]"
                }`}
              >
                {lit ? (
                  <span
                    className="text-[16px]"
                    dangerouslySetInnerHTML={{ __html: icon("flame") }}
                  />
                ) : null}
              </span>
              <span className={lit ? "text-ink" : "text-soft"}>{d}</span>
            </div>
          );
        })}
      </div>
    </div>

    {showModal && streak > 0 && (
      <SuccessModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`🔥 Streak Preserved! Day ${streak}`}
        badgeText={`${streak}-Day Streak Active`}
        iconHtml={icon("flame")}
        accentColor="lemon"
        confetti={true}
        soundEffect="victory"
        primaryAction={{
          label: "Claim Daily Streak",
          onClick: () => setShowModal(false),
        }}
        secondaryAction={{
          label: "Keep Playing",
          onClick: () => {
            setShowModal(false);
            router.push("/feed");
          },
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-full rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
            <span className="text-xs font-bold text-soft uppercase tracking-wider">Current Consecutive Streak</span>
            <p className="text-5xl font-black text-ink my-1">{streak} Days</p>
            <p className="text-xs font-bold text-mint-foreground">🔥 +50 XP streak multiplier active</p>
          </div>
          <div className="w-full rounded-xl bg-lemon/20 p-3 border-2 border-ink text-left text-xs font-semibold">
            🎯 <span className="font-bold">Next Milestone:</span> Reach Day {nextMilestone} for a +250 XP bonus crate!
          </div>
          <p className="text-xs font-semibold text-soft">
            Play at least one game every day before midnight to preserve your streak and perks.
          </p>
        </div>
      </SuccessModal>
    )}
  </>
  );
}

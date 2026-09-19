"use client";

import { icon } from "@playloop/ui";

/**
 * 7-day streak card matching the prototype's .streak / .sdays design.
 * Thick border, rounded corners, flame icons on active days.
 */

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function StreakCard({ streak, playedToday }: { streak: number; playedToday: boolean }) {
  const jsDay = new Date().getDay(); // 0=Sun
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon

  return (
    <div className="mt-3 rounded-[18px] bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center justify-between font-extrabold">
        <span className="text-[15px]">{streak > 0 ? `${streak}-day streak` : "No streak yet"}</span>
        <span className="text-[13px] font-semibold text-soft">
          {streak === 0
            ? "Play a game to start"
            : playedToday
              ? "Today counted"
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
  );
}

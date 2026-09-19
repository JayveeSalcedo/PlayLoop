"use client";

import { TIERS, PERKS, xpNeed } from "@playloop/economy";
import { icon } from "@playloop/ui";
import { useState } from "react";

export function PerksModal({
  currentLevel,
  currentXp,
}: {
  currentLevel: number;
  currentXp: number;
}) {
  const [open, setOpen] = useState(false);
  const need = xpNeed(currentLevel);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
      >
        <span className="flex items-center gap-1.5">
          <span dangerouslySetInnerHTML={{ __html: icon("spark") }} />
          View All Perks & Levels
        </span>
        <span className="text-[11px] opacity-80">8 Tiers &rarr;</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div className="card-hard max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Level Perks</h2>
                <p className="text-xs font-bold text-soft">
                  Level {currentLevel} · {currentXp}/{need} XP
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
                aria-label="Close"
              >
                <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              {TIERS.map((tierName, idx) => {
                const lvl = idx + 1;
                const isCurrent = lvl === currentLevel;
                const isUnlocked = lvl <= currentLevel;
                const perk = PERKS[idx] || "New rewards & higher limits";

                return (
                  <div
                    key={lvl}
                    className={`flex items-start gap-3 rounded-2xl p-3 transition-colors [border:var(--border-thick)] ${
                      isCurrent
                        ? "bg-lemon [box-shadow:var(--shadow-sm)]"
                        : isUnlocked
                          ? "bg-card"
                          : "bg-paper opacity-60"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-extrabold [border:2px_solid_var(--ink)] ${
                        isCurrent
                          ? "bg-ink text-white"
                          : isUnlocked
                            ? "bg-mint text-ink"
                            : "bg-paper text-soft"
                      }`}
                    >
                      {lvl}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <b className="text-sm font-extrabold">
                          {tierName} {isCurrent && <span className="text-xs font-bold text-ink/70">(Current)</span>}
                        </b>
                        {isUnlocked ? (
                          <span className="text-xs font-bold text-ink">
                            ✓ Unlocked
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-soft">
                            {xpNeed(lvl)} XP
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-soft">
                        {perk || "Base tier unlocked"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn go block mt-5 w-full"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

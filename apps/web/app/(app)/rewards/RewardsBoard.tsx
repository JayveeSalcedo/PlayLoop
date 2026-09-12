"use client";

import { icon, THEMES, type IconName, type ThemeName } from "@playloop/ui";
import { useMemo, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { redeemReward, type RedeemResult } from "./actions";

export interface RewardRow {
  id: string;
  brandName: string;
  name: string;
  description: string;
  category: "Food and drink" | "Fun" | "Shopping";
  costPoints: number;
  theme: string;
  icon: string;
  poolTotal: number | null;
  poolRemaining: number | null;
}

const CATEGORIES = ["All", "Food and drink", "Fun", "Shopping"] as const;
type Category = (typeof CATEGORIES)[number];

type Stage = "browsing" | "confirming" | "redeeming" | "voucher";

export function RewardsBoard({ pointsBalance, rewards }: { pointsBalance: number; rewards: RewardRow[] }) {
  const [cat, setCat] = useState<Category>("All");
  const [balance, setBalance] = useState(pointsBalance);
  /** Pool counts that have moved since this page was rendered, by reward id. */
  const [pools, setPools] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<RewardRow | null>(null);
  const [stage, setStage] = useState<Stage>("browsing");
  const [voucher, setVoucher] = useState<RedeemResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => (cat === "All" ? rewards : rewards.filter((r) => r.category === cat)), [cat, rewards]);

  /** Units left for `r`, preferring a count this session has seen move. */
  function remainingFor(r: RewardRow) {
    return pools[r.id] ?? r.poolRemaining;
  }

  function isSoldOut(r: RewardRow) {
    const remaining = remainingFor(r);
    return r.poolTotal != null && remaining != null && remaining <= 0;
  }

  function openReward(r: RewardRow) {
    if (isSoldOut(r)) return;
    setSelected(r);
    setError(null);
    setStage("confirming");
  }

  function closeSheet() {
    setStage("browsing");
    setSelected(null);
  }

  async function confirmRedeem() {
    if (!selected) return;
    setStage("redeeming");
    setError(null);
    try {
      const result = await redeemReward(selected.id);
      setVoucher(result);
      setBalance(result.pointsBalance);
      if (result.poolRemaining != null) setPools((p) => ({ ...p, [selected.id]: result.poolRemaining! }));
      setStage("voucher");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't redeem that reward — try again.");
      setStage("confirming");
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Rewards</h1>
      <p className="mt-1 text-sm font-bold text-soft">{balance.toLocaleString("en-US")} points to spend</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border-2 border-ink px-3 py-1.5 text-sm font-bold ${c === cat ? "bg-ink text-white" : "bg-card"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {visible.map((r) => {
          const remaining = remainingFor(r);
          const soldOut = isSoldOut(r);
          const affordable = balance >= r.costPoints && !soldOut;
          return (
            <button
              key={r.id}
              onClick={() => openReward(r)}
              className="flex flex-col overflow-hidden rounded-2xl bg-card text-left [border:var(--border-thick)] [box-shadow:var(--shadow-hard-sm)]"
            >
              <div
                className="flex h-24 flex-col justify-between p-3 text-ink"
                style={{ background: (THEMES[r.theme as ThemeName] ?? THEMES.neon!)[0] }}
              >
                <span className="text-lg font-extrabold leading-none">{r.brandName}</span>
                <span
                  className="self-end text-3xl"
                  dangerouslySetInnerHTML={{ __html: icon(r.icon as IconName) }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <b className="text-sm leading-tight">{r.name}</b>
                <span className="flex items-center gap-1 text-sm font-extrabold">{r.costPoints.toLocaleString("en-US")} pts</span>
                {r.poolTotal != null ? (
                  <span className="text-xs font-bold text-soft">{remaining} of {r.poolTotal} left</span>
                ) : null}
                <span
                  className={`mt-auto rounded-lg border-2 border-ink px-2 py-1 text-center text-xs font-extrabold ${affordable ? "bg-mint" : "bg-paper text-soft"}`}
                >
                  {soldOut
                    ? "Sold out"
                    : affordable
                      ? "Redeem"
                      : `Need ${(r.costPoints - balance).toLocaleString("en-US")} more`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? <p className="mt-6 text-sm text-soft">No rewards in this category yet.</p> : null}

      {stage !== "browsing" && selected ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40" onClick={stage === "confirming" ? closeSheet : undefined}>
          <div
            className="w-full max-w-sm rounded-t-3xl bg-paper p-6 [border-top:var(--border-thick)]"
            onClick={(e) => e.stopPropagation()}
          >
            {stage === "voucher" && voucher ? (
              <div className="text-center">
                <p className="text-sm font-bold text-soft">{voucher.brandName}</p>
                <b className="text-xl">{voucher.rewardName}</b>
                <div
                  className="mx-auto my-4 h-40 w-40 rounded-xl bg-white p-2 [border:var(--border-thick)]"
                  dangerouslySetInnerHTML={{ __html: voucher.qrSvg }}
                />
                <p className="text-lg font-extrabold tracking-widest">{voucher.code}</p>
                <p className="mt-2 text-sm text-soft">Show this at the counter. Valid for 7 days.</p>
                <p className="mt-1 text-xs text-soft">Find it again any time in your Wallet.</p>
                <button
                  onClick={() => {
                    closeSheet();
                    setVoucher(null);
                  }}
                  className="btn go lg block mt-6"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl text-2xl [border:var(--border-thick)]"
                    dangerouslySetInnerHTML={{ __html: icon(selected.icon as IconName) }}
                  />
                  <div>
                    <p className="text-sm font-bold text-soft">{selected.brandName}</p>
                    <b className="text-xl">{selected.name}</b>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl bg-card [border:var(--border-thick)]">
                  <div className="flex justify-between border-b-2 border-ink/10 p-3 font-semibold">
                    <span>Cost</span>
                    <b>{selected.costPoints.toLocaleString("en-US")} pts</b>
                  </div>
                  <div className="flex justify-between border-b-2 border-ink/10 p-3 font-semibold">
                    <span>Your balance</span>
                    <b>{balance.toLocaleString("en-US")} pts</b>
                  </div>
                  <div className="flex justify-between p-3 font-semibold">
                    <span>{balance >= selected.costPoints ? "After redeeming" : "Still needed"}</span>
                    <b>{Math.abs(balance - selected.costPoints).toLocaleString("en-US")} pts</b>
                  </div>
                </div>
                {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
                {balance >= selected.costPoints ? (
                  <button onClick={confirmRedeem} disabled={stage === "redeeming"} className="btn go lg block mt-4">
                    {stage === "redeeming" ? (
                      <>
                        <Spinner size={22} /> Redeeming…
                      </>
                    ) : (
                      `Redeem for ${selected.costPoints.toLocaleString("en-US")} pts`
                    )}
                  </button>
                ) : (
                  <a href="/feed" className="btn go lg block mt-4">
                    Play to earn {(selected.costPoints - balance).toLocaleString("en-US")} more
                  </a>
                )}
                <button onClick={closeSheet} className="btn block mt-2" style={{ boxShadow: "none" }}>
                  Not now
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import { icon, type IconName } from "@playloop/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { setRewardActive, topUpPool } from "./actions";
import { EditRewardForm, type BrandOption } from "./RewardForm";

export interface AdminReward {
  id: string;
  name: string;
  description: string;
  brandId: string;
  brandName: string;
  category: string;
  costPoints: number;
  theme: string;
  icon: string;
  poolTotal: number | null;
  poolRemaining: number | null;
  active: boolean;
}

export function RewardRow({ reward, brands }: { reward: AdminReward; brands: BrandOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUp, setTopUp] = useState("");
  const [topUpSuccess, setTopUpSuccess] = useState<{ units: number } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setTopUp("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card-hard rounded-2xl p-4 [border:var(--border-thick)] ${reward.active ? "bg-card" : "bg-paper"}`}>
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper [border:var(--border-thick)]"
          dangerouslySetInnerHTML={{ __html: icon(reward.icon as IconName) }}
        />
        <div className="min-w-0">
          <p className={`font-extrabold ${reward.active ? "" : "text-soft line-through"}`}>{reward.name}</p>
          <p className="text-xs font-bold text-soft flex flex-wrap items-center gap-1">
            <span>{reward.brandName} · {reward.category} ·</span>
            <span className="inline-flex items-center gap-1 font-extrabold text-ink">
              <span className="coin sm" aria-hidden="true" />
              {reward.costPoints.toLocaleString("en-US")} pts
            </span>
            <span>· {reward.poolTotal == null
              ? "uncapped"
              : `${reward.poolRemaining?.toLocaleString("en-US")} of ${reward.poolTotal.toLocaleString("en-US")} left`}</span>
          </p>
        </div>
        {!reward.active ? (
          <span className="ml-auto shrink-0 rounded-full bg-card px-2 py-1 text-xs font-extrabold text-soft [border:var(--border-thick)]">
            off
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm font-bold text-gum">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn sm" disabled={busy} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit"}
        </button>
        <button
          className="btn sm"
          disabled={busy}
          onClick={() => run(() => setRewardActive(reward.id, !reward.active))}
        >
          {busy ? <Spinner size={16} /> : reward.active ? "Deactivate" : "Reactivate"}
        </button>

        {reward.poolTotal != null ? (
          <>
            <input
              type="number"
              min={1}
              placeholder="units"
              value={topUp}
              onChange={(e) => setTopUp(e.target.value)}
              className="w-24 rounded-xl bg-paper p-2 text-sm font-semibold [border:var(--border-thick)]"
              suppressHydrationWarning
            />
            <button
              className="btn sm"
              disabled={busy || !topUp.trim()}
              onClick={async () => {
                const units = Number(topUp);
                if (!units || isNaN(units)) return;
                setBusy(true);
                setError(null);
                try {
                  await topUpPool(reward.id, units);
                  setTopUpSuccess({ units });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't save that — try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Top up
            </button>
          </>
        ) : null}
      </div>

      {editing ? (
        <EditRewardForm
          rewardId={reward.id}
          brands={brands}
          initial={{
            name: reward.name,
            description: reward.description,
            brandId: reward.brandId,
            category: reward.category,
            costPoints: reward.costPoints,
            theme: reward.theme,
            icon: reward.icon,
            poolTotal: reward.poolTotal,
            poolRemaining: reward.poolRemaining,
          }}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {topUpSuccess && (
        <SuccessModal
          isOpen={Boolean(topUpSuccess)}
          onClose={() => {
            setTopUpSuccess(null);
            setTopUp("");
            router.refresh();
          }}
          title="Reward Voucher Pool Topped Up!"
          badgeText="Inventory Updated"
          iconHtml={icon("gift")}
          accentColor="mint"
          confetti={false}
          soundEffect="tap"
          primaryAction={{
            label: "Done",
            onClick: () => {
              setTopUpSuccess(null);
              setTopUp("");
              router.refresh();
            },
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <p className="text-xs font-bold text-soft">{reward.brandName}</p>
              <h3 className="text-base font-extrabold text-ink">{reward.name}</h3>
              <div className="mt-2 flex justify-between border-t border-ink/10 pt-2 text-xs font-bold">
                <span className="text-soft">Units Added</span>
                <span className="font-extrabold text-mint-foreground">+{topUpSuccess.units.toLocaleString("en-US")} units</span>
              </div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-soft">New Pool Total</span>
                <span className="font-extrabold text-ink">{((reward.poolTotal ?? 0) + topUpSuccess.units).toLocaleString("en-US")} units</span>
              </div>
            </div>
          </div>
        </SuccessModal>
      )}
    </div>
  );
}

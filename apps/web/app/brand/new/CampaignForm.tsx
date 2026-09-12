"use client";

import { formatAed } from "@playloop/economy";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { createCampaign } from "../actions";

interface GameOption {
  id: string;
  title: string;
  playCount: number;
  brandOriginal: boolean;
  sponsorReady: boolean;
}
interface RewardOption {
  id: string;
  name: string;
  poolTotal: number | null;
  poolRemaining: number | null;
}

const DURATIONS = [7, 14, 30];

/** Today and today+n as YYYY-MM-DD, in the viewer's own calendar. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CampaignForm({ games, rewards }: { games: GameOption[]; rewards: RewardOption[] }) {
  const router = useRouter();
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [rewardId, setRewardId] = useState(rewards[0]?.id ?? "");
  const [budgetAed, setBudgetAed] = useState("5000");
  const [startsOn, setStartsOn] = useState(isoDay());
  const [days, setDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endsOn = (() => {
    const d = new Date(`${startsOn}T00:00:00`);
    if (Number.isNaN(d.getTime())) return startsOn;
    d.setDate(d.getDate() + days - 1); // inclusive of the start day
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const budgetFils = Math.round(Number(budgetAed) * 100);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const { id } = await createCampaign({ gameId, rewardId, budgetAed: Number(budgetAed), startsOn, endsOn });
      router.push(`/brand/campaigns/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that campaign — try again.");
      setSaving(false);
    }
  }

  const field = "w-full rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]";

  return (
    <div className="mt-6">
      <label className="block text-sm font-extrabold" htmlFor="game">
        Game to sponsor
      </label>
      <p className="mb-2 text-xs font-bold text-soft">Only games that are live in the feed.</p>
      <select id="game" className={field} value={gameId} onChange={(e) => setGameId(e.target.value)} suppressHydrationWarning>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title} — {g.playCount.toLocaleString("en-US")} plays
            {g.brandOriginal ? " · brand original" : g.sponsorReady ? " · open to sponsors" : ""}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-sm font-extrabold" htmlFor="reward">
        Reward pool
      </label>
      <p className="mb-2 text-xs font-bold text-soft">One of your own rewards.</p>
      <select id="reward" className={field} value={rewardId} onChange={(e) => setRewardId(e.target.value)} suppressHydrationWarning>
        {rewards.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.poolTotal != null ? ` — ${r.poolRemaining} of ${r.poolTotal} left` : " — uncapped"}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-sm font-extrabold" htmlFor="budget">
        Budget (AED)
      </label>
      <p className="mb-2 text-xs font-bold text-soft">What you&apos;re committing to this campaign.</p>
      <input
        id="budget"
        type="number"
        min={1}
        step={1}
        className={field}
        value={budgetAed}
        onChange={(e) => setBudgetAed(e.target.value)}
        suppressHydrationWarning
      />
      {budgetFils > 0 ? <p className="mt-1 text-xs font-bold text-soft">{formatAed(budgetFils)}</p> : null}

      <label className="mt-5 block text-sm font-extrabold" htmlFor="starts">
        Starts
      </label>
      <div className="mb-2" />
      <input
        id="starts"
        type="date"
        className={field}
        value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)}
        suppressHydrationWarning
      />

      <label className="mt-5 block text-sm font-extrabold">Duration</label>
      <div className="mb-2" />
      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`flex-1 rounded-xl p-2 text-sm font-extrabold [border:var(--border-thick)] ${
              days === d ? "bg-lemon" : "bg-card"
            }`}
          >
            {d} days
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-bold text-soft">
        Runs {startsOn} to {endsOn}, inclusive.
      </p>

      {error ? <p className="mt-4 text-sm font-bold text-gum">{error}</p> : null}

      <button className="btn go block mt-6" onClick={submit} disabled={saving || !gameId || !rewardId}>
        {saving ? (
          <>
            <Spinner size={22} /> Creating…
          </>
        ) : (
          "Create campaign"
        )}
      </button>
    </div>
  );
}

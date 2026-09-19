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
const CITIES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Al Ain"];

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
  const [selectedCities, setSelectedCities] = useState<string[]>(["Dubai", "Abu Dhabi"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endsOn = (() => {
    const d = new Date(`${startsOn}T00:00:00`);
    if (Number.isNaN(d.getTime())) return startsOn;
    d.setDate(d.getDate() + days - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const budgetFils = Math.round(Number(budgetAed) * 100);

  // Dynamic forecast calculator based on prototype formulas
  const numBudget = Math.max(0, Number(budgetAed) || 0);
  const estPlays = Math.round(numBudget * 2.8);
  const estNewUsers = Math.round(estPlays * 0.38);
  const estMinutes = Math.round(estPlays * 0.5);
  const estVisits = Math.round(estPlays * 0.18);
  const estCpp = estPlays > 0 ? (numBudget / estPlays).toFixed(2) : "0.36";

  function toggleCity(city: string) {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  }

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

      {/* City Geotargeting */}
      <label className="mt-5 block text-sm font-extrabold">
        Target Cities
      </label>
      <p className="mb-2 text-xs font-bold text-soft">Focus your campaign on specific markets.</p>
      <div className="flex flex-wrap gap-1.5">
        {CITIES.map((c) => {
          const on = selectedCities.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCity(c)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors [border:1.5px_solid_var(--ink)] ${
                on ? "bg-ink text-white" : "bg-card text-ink"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

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
            type="button"
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

      {/* Live Forecast Box — prototype's .fc */}
      <div className="card-hard mt-6 rounded-2xl bg-lemon/20 p-4 [border:var(--border-thick)]">
        <div className="flex items-baseline justify-between">
          <b className="text-sm font-extrabold text-ink">Campaign Forecast</b>
          <span className="text-xs font-bold text-soft">
            {days} days · AED {numBudget.toLocaleString("en-US")}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-card p-2 [border:1.5px_solid_var(--ink)]">
            <span className="font-bold text-soft">Est. Plays</span>
            <p className="text-base font-extrabold">{estPlays.toLocaleString("en-US")}</p>
          </div>
          <div className="rounded-xl bg-card p-2 [border:1.5px_solid_var(--ink)]">
            <span className="font-bold text-soft">Est. Attention</span>
            <p className="text-base font-extrabold">{estMinutes.toLocaleString("en-US")} mins</p>
          </div>
          <div className="rounded-xl bg-card p-2 [border:1.5px_solid_var(--ink)]">
            <span className="font-bold text-soft">Store Footfall</span>
            <p className="text-base font-extrabold">~{estVisits.toLocaleString("en-US")} visits</p>
          </div>
          <div className="rounded-xl bg-card p-2 [border:1.5px_solid_var(--ink)]">
            <span className="font-bold text-soft">Est. Cost Per Play</span>
            <p className="text-base font-extrabold">AED {estCpp}</p>
          </div>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm font-bold text-gum">{error}</p> : null}

      <button className="btn go block mt-6 w-full" onClick={submit} disabled={saving || !gameId || !rewardId}>
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

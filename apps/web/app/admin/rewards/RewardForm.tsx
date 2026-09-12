"use client";

import { THEMES } from "@playloop/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { REWARD_CATEGORIES, REWARD_ICONS, validateRewardDraft, type RewardDraft } from "@/lib/rewardDraft";
import { createReward, updateReward } from "./actions";

export interface BrandOption {
  id: string;
  name: string;
}

const field = "w-full rounded-2xl bg-paper p-3 font-semibold [border:var(--border-thick)]";

/** Shared body for both create and edit; `existing` decides which action runs. */
function Fields({
  brands,
  initial,
  onDone,
  submitLabel,
  submit,
}: {
  brands: BrandOption[];
  initial: Partial<RewardDraft>;
  onDone: () => void;
  submitLabel: string;
  submit: (draft: RewardDraft) => Promise<unknown>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RewardDraft>({
    name: initial.name ?? "",
    description: initial.description ?? "",
    brandId: initial.brandId ?? brands[0]?.id ?? "",
    category: initial.category ?? REWARD_CATEGORIES[0],
    costPoints: initial.costPoints ?? 500,
    theme: initial.theme ?? "ember",
    icon: initial.icon ?? "gift",
    poolTotal: initial.poolTotal ?? null,
    poolRemaining: initial.poolRemaining ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<RewardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const issues = validateRewardDraft({ ...draft, poolRemaining: draft.poolTotal == null ? null : draft.poolRemaining });

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await submit(draft);
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <label className="block text-sm font-extrabold">Name</label>
      <input className={`${field} mt-1`} value={draft.name} onChange={(e) => set({ name: e.target.value })} suppressHydrationWarning />

      <label className="mt-4 block text-sm font-extrabold">Description</label>
      <input
        className={`${field} mt-1`}
        value={draft.description}
        onChange={(e) => set({ description: e.target.value })}
        suppressHydrationWarning
      />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-extrabold">Brand</label>
          <select className={`${field} mt-1`} value={draft.brandId} onChange={(e) => set({ brandId: e.target.value })} suppressHydrationWarning>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-extrabold">Category</label>
          <select className={`${field} mt-1`} value={draft.category} onChange={(e) => set({ category: e.target.value })} suppressHydrationWarning>
            {REWARD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-extrabold">Cost (points)</label>
          <input
            type="number"
            min={1}
            className={`${field} mt-1`}
            value={draft.costPoints}
            onChange={(e) => set({ costPoints: Number(e.target.value) })}
            suppressHydrationWarning
          />
        </div>
        <div>
          <label className="block text-sm font-extrabold">Icon</label>
          <select className={`${field} mt-1`} value={draft.icon} onChange={(e) => set({ icon: e.target.value })} suppressHydrationWarning>
            {REWARD_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-4 block text-sm font-extrabold">Colour</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {Object.entries(THEMES).map(([key, [a, b]]) => (
          <button
            key={key}
            aria-label={key}
            onClick={() => set({ theme: key })}
            className={`h-9 w-9 rounded-xl [border:var(--border-thick)] ${draft.theme === key ? "ring-4 ring-ink" : ""}`}
            style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
          />
        ))}
      </div>

      {initial.poolTotal === undefined ? (
        <>
          <label className="mt-4 block text-sm font-extrabold">Pool size</label>
          <p className="mb-1 text-xs font-bold text-soft">Leave empty for an uncapped reward. Top up later from the list.</p>
          <input
            type="number"
            min={1}
            placeholder="uncapped"
            className={field}
            value={draft.poolTotal ?? ""}
            onChange={(e) => set({ poolTotal: e.target.value === "" ? null : Number(e.target.value) })}
            suppressHydrationWarning
          />
        </>
      ) : null}

      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}
      {issues.length > 0 ? <p className="mt-3 text-sm font-bold text-soft">{issues[0]!.message}</p> : null}

      <div className="mt-4 flex gap-2">
        <button className="btn go" disabled={busy || issues.length > 0} onClick={run}>
          {busy ? (
            <>
              <Spinner size={20} /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button className="btn" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function NewRewardForm({ brands }: { brands: BrandOption[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn go mt-6" onClick={() => setOpen(true)}>
        New reward
      </button>
    );
  }

  return (
    <Fields
      brands={brands}
      initial={{}}
      submitLabel="Create reward"
      submit={(d) => createReward(d)}
      onDone={() => setOpen(false)}
    />
  );
}

export function EditRewardForm({
  rewardId,
  brands,
  initial,
  onDone,
}: {
  rewardId: string;
  brands: BrandOption[];
  initial: Partial<RewardDraft>;
  onDone: () => void;
}) {
  return (
    <Fields
      brands={brands}
      initial={initial}
      submitLabel="Save changes"
      submit={(d) => updateReward(rewardId, d)}
      onDone={onDone}
    />
  );
}

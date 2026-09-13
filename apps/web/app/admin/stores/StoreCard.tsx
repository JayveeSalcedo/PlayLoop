"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { addStoreStaff, removeStoreStaff, setStoreActive } from "./actions";

export interface StoreStaffRow {
  profileId: string;
  email: string;
  name: string | null;
}

export interface AdminStore {
  id: string;
  name: string;
  city: string;
  brandName: string;
  active: boolean;
  staff: StoreStaffRow[];
}

export function StoreCard({ store }: { store: AdminStore }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card-hard rounded-2xl p-4 [border:var(--border-thick)] ${store.active ? "bg-card" : "bg-paper"}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className={`font-extrabold ${store.active ? "" : "text-soft line-through"}`}>{store.name}</p>
          <p className="text-xs font-bold text-soft">
            {store.brandName} · {store.city}
          </p>
        </div>
        {!store.active ? (
          <span className="ml-auto shrink-0 rounded-full bg-card px-2 py-1 text-xs font-extrabold text-soft [border:var(--border-thick)]">
            off
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-extrabold text-soft">
        {store.staff.length === 0 ? "No one can scan at this store yet." : "Scanner access"}
      </p>
      {store.staff.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {store.staff.map((s) => (
            <li key={s.profileId} className="flex items-center gap-2 rounded-xl bg-paper p-2 [border:var(--border-thick)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{s.name ?? "(no name)"}</p>
                <p className="truncate text-xs font-bold text-soft">{s.email}</p>
              </div>
              <button
                className="btn sm ml-auto"
                disabled={busy}
                onClick={() => run(() => removeStoreStaff(store.id, s.profileId))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-sm font-bold text-gum">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="email"
          placeholder="staff@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-paper p-2 text-sm font-semibold [border:var(--border-thick)]"
          suppressHydrationWarning
        />
        <button
          className="btn sm"
          disabled={busy || !email.trim()}
          onClick={() => run(() => addStoreStaff(store.id, email))}
        >
          {busy ? <Spinner size={16} /> : "Add staff"}
        </button>
      </div>
      <p className="mt-1 text-xs font-bold text-soft">They need to have signed up already — this doesn&apos;t invite anyone.</p>

      <button
        className="btn sm mt-3"
        disabled={busy}
        onClick={() => run(() => setStoreActive(store.id, !store.active))}
      >
        {busy ? <Spinner size={16} /> : store.active ? "Deactivate store" : "Reactivate store"}
      </button>
    </div>
  );
}

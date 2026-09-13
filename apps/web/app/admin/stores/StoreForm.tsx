"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { createStore } from "./actions";

export interface BrandOption {
  id: string;
  name: string;
}

const field = "w-full rounded-2xl bg-paper p-3 font-semibold [border:var(--border-thick)]";

export function NewStoreForm({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (brands.length === 0) {
    return <p className="mt-6 text-sm font-bold text-soft">Create a brand first — a store has to belong to one.</p>;
  }

  if (!open) {
    return (
      <button className="btn go mt-6" onClick={() => setOpen(true)}>
        New store
      </button>
    );
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await createStore({ brandId, name, city });
      setOpen(false);
      setName("");
      setCity("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that store.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <label className="block text-sm font-extrabold">Brand</label>
      <select className={`${field} mt-1`} value={brandId} onChange={(e) => setBrandId(e.target.value)} suppressHydrationWarning>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-sm font-extrabold">Name</label>
      <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} suppressHydrationWarning />

      <label className="mt-4 block text-sm font-extrabold">City</label>
      <input className={`${field} mt-1`} value={city} onChange={(e) => setCity(e.target.value)} suppressHydrationWarning />

      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button className="btn go" disabled={busy || !name.trim() || !city.trim()} onClick={run}>
          {busy ? (
            <>
              <Spinner size={20} /> Creating…
            </>
          ) : (
            "Create store"
          )}
        </button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

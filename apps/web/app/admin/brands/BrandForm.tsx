"use client";

import { THEMES } from "@playloop/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { createBrand } from "./actions";

const field = "w-full rounded-2xl bg-paper p-3 font-semibold [border:var(--border-thick)]";

export function NewBrandForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState("neon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn go mt-6" onClick={() => setOpen(true)}>
        New brand
      </button>
    );
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await createBrand({ name, description, theme });
      setOpen(false);
      setName("");
      setDescription("");
      setTheme("neon");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that brand.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <label className="block text-sm font-extrabold">Name</label>
      <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} suppressHydrationWarning />

      <label className="mt-4 block text-sm font-extrabold">Description</label>
      <input
        className={`${field} mt-1`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        suppressHydrationWarning
      />

      <label className="mt-4 block text-sm font-extrabold">Colour</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {Object.entries(THEMES).map(([key, [a, b]]) => (
          <button
            key={key}
            aria-label={key}
            onClick={() => setTheme(key)}
            className={`h-9 w-9 rounded-xl [border:var(--border-thick)] ${theme === key ? "ring-4 ring-ink" : ""}`}
            style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
          />
        ))}
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button className="btn go" disabled={busy || !name.trim()} onClick={run}>
          {busy ? (
            <>
              <Spinner size={20} /> Creating…
            </>
          ) : (
            "Create brand"
          )}
        </button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

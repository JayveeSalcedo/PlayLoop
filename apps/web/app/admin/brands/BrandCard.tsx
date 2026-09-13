"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { addBrandMember, removeBrandMember } from "./actions";

export interface BrandMemberRow {
  profileId: string;
  email: string;
  name: string | null;
}

export interface AdminBrand {
  id: string;
  name: string;
  description: string;
  theme: string;
  members: BrandMemberRow[];
}

export function BrandCard({ brand }: { brand: AdminBrand }) {
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
    <div className="rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <p className="font-extrabold">{brand.name}</p>
      {brand.description ? <p className="mt-1 text-sm text-soft">{brand.description}</p> : null}

      <p className="mt-3 text-xs font-extrabold text-soft">
        {brand.members.length === 0 ? "No one can access this brand's console yet." : "Console access"}
      </p>
      {brand.members.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {brand.members.map((m) => (
            <li key={m.profileId} className="flex items-center gap-2 rounded-xl bg-paper p-2 [border:var(--border-thick)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{m.name ?? "(no name)"}</p>
                <p className="truncate text-xs font-bold text-soft">{m.email}</p>
              </div>
              <button
                className="btn sm ml-auto"
                disabled={busy}
                onClick={() => run(() => removeBrandMember(brand.id, m.profileId))}
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
          placeholder="player@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-paper p-2 text-sm font-semibold [border:var(--border-thick)]"
          suppressHydrationWarning
        />
        <button
          className="btn sm"
          disabled={busy || !email.trim()}
          onClick={() => run(() => addBrandMember(brand.id, email))}
        >
          {busy ? <Spinner size={16} /> : "Add member"}
        </button>
      </div>
      <p className="mt-1 text-xs font-bold text-soft">They need to have signed up already — this doesn't invite anyone.</p>
    </div>
  );
}

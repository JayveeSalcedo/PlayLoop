"use client";

/**
 * "Generate a game from anything" — the primary way into game creation, shown
 * at the top of the same screen as the classic templates below it. Not a
 * separate page: describing an idea and picking a template are two ways to
 * start the one /create flow, not two different destinations.
 *
 * On success this hands off to the generation job pages (/create/studio/...),
 * which already handle running the job, resuming it if the tab is reopened,
 * and versioning what comes out. This component only starts the job.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import type { JobView } from "@/lib/generation/jobs";

const MAX_IDEA = 1_000;

const CHIPS = [
  { label: "Café menu", idea: "A game for a café: catch the drinks and pastries from our menu as they fall, burnt items cost points" },
  { label: "Product page", idea: "A game promoting our product: collect it as it flies across the screen, dodge the knock-offs" },
  { label: "Topic: UAE space missions", idea: "Pilot the Hope probe to Mars: dodge asteroids and collect fuel cells on the way" },
  { label: "Lesson notes: the water cycle", idea: "Guide a water droplet through evaporation, clouds and rain, collecting sunlight and avoiding pollution" },
];

export function AiGenerateBox({ providerLabel }: { providerLabel: string }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "create", request: idea }),
      });
      const data = (await res.json()) as JobView & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't start that — try again.");
      router.push(`/create/studio/jobs/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that — try again.");
      setBusy(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl bg-night p-5 text-white [border:var(--border-thick)] [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:14px_14px]"
      aria-labelledby="ai-generate-h"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-lemon px-2 py-0.5 text-xs font-extrabold text-ink">AI</span>
        <h2 id="ai-generate-h" className="text-xl font-extrabold">
          Generate a game from anything
        </h2>
      </div>
      <p className="text-sm font-semibold text-white/80">
        Paste a menu, a product page or lesson notes, or just type a topic. You get a playable game, tested by bots, in about a
        minute.
      </p>
      <label htmlFor="create-idea" className="sr-only">
        Your idea or content
      </label>
      <textarea
        id="create-idea"
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, MAX_IDEA))}
        rows={4}
        placeholder="Paste content or type a topic"
        className="min-h-28 w-full resize-y rounded-xl bg-white p-3 font-semibold text-ink [border:var(--border-thick)]"
        disabled={busy}
        suppressHydrationWarning
      />
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => setIdea(chip.idea)}
            disabled={busy}
            className="rounded-full border-2 border-white/40 px-3 py-1 text-xs font-extrabold text-white hover:border-white"
          >
            {chip.label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-gum">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn go" disabled={!idea.trim() || busy} onClick={generate}>
          {busy ? (
            <>
              <Spinner size={18} /> Starting…
            </>
          ) : (
            "⚡ Generate game"
          )}
        </button>
        <span className="text-xs font-bold text-white/60">{providerLabel}</span>
      </div>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GamePreview } from "@/app/_components/GamePreview";

interface Template {
  id: string;
  title: string;
  hint: string;
  code: string;
  imageSlots: number;
}

/** Stable identity: GamePreview re-renders its still frame whenever `images` changes. */
const NO_IMAGES: Record<string, string> = {};

const CHIPS = [
  { label: "Café menu", idea: "A game for a café: catch the drinks and pastries from our menu as they fall, burnt croissants cost points" },
  { label: "Product launch", idea: "Tap our new sneakers as they fly across the screen; fake knock-offs cost points" },
  { label: "Topic: UAE space missions", idea: "Pilot the Hope probe to Mars: dodge asteroids and collect fuel cells on the way" },
  { label: "Lesson: the water cycle", idea: "Guide a water droplet through evaporation, clouds and rain, collecting sunlight and avoiding pollution" },
];

export function StudioStart({ templates, provider }: { templates: Template[]; provider: string }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idea" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(body: { idea: string } | { templateId: string }, kind: "idea" | "template") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { projectId?: string; error?: string };
      if (!res.ok || !data.projectId) throw new Error(data.error ?? "Couldn't start.");
      router.push(`/studio/${data.projectId}?step=customise`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <>
      <section
        className="flex flex-col gap-3 rounded-2xl bg-night p-5 text-white [border:var(--border-thick)] [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:14px_14px]"
        aria-labelledby="ai-h"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-lemon px-2 py-0.5 text-xs font-extrabold text-ink">AI</span>
          <h2 id="ai-h" className="text-xl font-extrabold">
            Generate a game from anything
          </h2>
        </div>
        <p className="text-sm font-semibold text-white/80">
          Paste a menu, a product page or lesson notes, or just type a topic. You get a playable game, tested by bots, in about a minute.
        </p>
        <label htmlFor="studio-idea" className="sr-only">
          Your idea or content
        </label>
        <textarea
          id="studio-idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={1000}
          placeholder="Paste content or type a topic"
          className="min-h-28 w-full resize-y rounded-xl bg-white p-3 font-semibold text-ink [border:var(--border-thick)]"
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button key={chip.label} type="button" onClick={() => setIdea(chip.idea)} className="rounded-full border-2 border-white/40 px-3 py-1 text-xs font-extrabold text-white hover:border-white">
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn go" disabled={!idea.trim() || busy !== null} onClick={() => start({ idea }, "idea")}>
            {busy === "idea" ? "Starting…" : "✦ Generate game"}
          </button>
          <span className="text-xs font-bold text-white/60">{provider}</span>
        </div>
      </section>

      {error ? (
        <p role="alert" className="card p-3 font-bold text-gum">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 text-sm font-bold text-soft" aria-hidden="true">
        <span className="h-0.5 flex-1 bg-faint/40" />
        or start from an example
        <span className="h-0.5 flex-1 bg-faint/40" />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="templates-h">
        <div>
          <h2 id="templates-h" className="text-xl font-extrabold">
            Start from an example
          </h2>
          <p className="text-sm font-semibold text-soft">Every example already passes the checks and plays well on a phone. Make it yours with images and AI changes.</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Examples">
          {templates.map((t) => {
            const isSelected = selected === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(t.id)}
                  className={`card flex w-full flex-col overflow-hidden text-left transition-transform hover:-translate-y-0.5 ${isSelected ? "ring-4 ring-violet" : ""}`}
                >
                  <div className="pointer-events-none relative aspect-[16/10] overflow-hidden border-b-[2.5px] border-ink bg-night">
                    <GamePreview code={t.code} images={NO_IMAGES} atSeconds={2.5} className="absolute inset-x-0 top-[-45%] aspect-[9/16] w-full" />
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <b className="text-lg">{t.title}</b>
                    <span className="text-sm font-semibold text-soft">{t.hint}</span>
                    {t.imageSlots ? <span className="chip mt-1 self-start">{t.imageSlots} image spot{t.imageSlots === 1 ? "" : "s"}</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t-[2.5px] border-ink bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="truncate text-sm font-bold text-soft">
            {selected ? `Example: ${templates.find((t) => t.id === selected)?.title}` : "Pick an example, or generate one above"}
          </span>
          <button type="button" className="btn go" disabled={!selected || busy !== null} onClick={() => selected && start({ templateId: selected }, "template")}>
            {busy === "template" ? "Setting up…" : "Customise →"}
          </button>
        </div>
      </div>
    </>
  );
}

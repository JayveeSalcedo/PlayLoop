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
import { THEMES, type ThemeName } from "@playloop/ui";
import { shrinkCoverImage } from "./shrink";
import { CoverCropperModal } from "./CoverCropperModal";
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
  const [maxPoints, setMaxPoints] = useState(200);
  const [theme, setTheme] = useState<ThemeName>("neon");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "create",
          request: idea,
          maxPoints,
          theme,
          coverImage,
        }),
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

      {/* Customise Cover & Payout (matches template wizard) */}
      <div className="mt-1 flex flex-col gap-3 rounded-xl bg-white/5 p-3.5 [border:1.5px_solid_rgba(255,255,255,0.15)]">
        <div>
          <span className="block text-xs font-extrabold text-white">Cover photo & style</span>
          <p className="mb-2 text-[11px] font-semibold text-white/70">
            Upload a custom photo or choose a vibrant theme gradient.
          </p>

          <div className="flex items-center gap-3">
            <div
              className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg [border:var(--border-thick)] shadow"
              style={{ background: coverImage ? "transparent" : `linear-gradient(135deg, ${THEMES[theme]?.[0] ?? "#7C3AED"}, ${THEMES[theme]?.[1] ?? "#06B6D4"})` }}
            >
              {coverImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverImage} alt="Cover preview" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-ink hover:bg-lemon [border:var(--border-thick)]">
                <span>📷 {coverImage ? "Change photo" : "Upload photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    setCoverError(null);
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";
                    if (file.size > 25 * 1024 * 1024) {
                      setCoverError("That image is over 25 MB. Pick a smaller one.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onerror = () => setCoverError("Couldn't read that file.");
                    reader.onload = () => {
                      setCroppingImage(String(reader.result));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>

              {coverImage ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCroppingImage(coverImage)}
                    className="rounded-xl border border-white/30 bg-transparent px-2.5 py-1.5 text-xs font-extrabold text-white hover:border-white"
                  >
                    ✂️ Adjust crop
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCoverImage(null)}
                    className="rounded-xl border border-white/30 bg-transparent px-2.5 py-1.5 text-xs font-extrabold text-white hover:border-white"
                  >
                    × Remove
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {coverError ? <p className="mt-1 text-xs font-bold text-gum">{coverError}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-white/80">Theme:</span>
            {Object.entries(THEMES).map(([key, [a, b]]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                disabled={busy}
                onClick={() => setTheme(key as ThemeName)}
                className={`h-7 w-7 rounded-lg [border:var(--border-thick)] ${theme === key ? "ring-2 ring-white" : ""}`}
                style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-white">
            <span>Max points per play</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-lemon px-2 py-0.5 text-ink">
              <span className="coin sm" aria-hidden="true" />
              {maxPoints} pts
            </span>
          </div>
          <p className="mt-0.5 mb-2 text-[11px] font-semibold text-white/70">
            Top players beating the score target earn up to this many points.
          </p>
          <input
            type="range"
            className="w-full accent-lemon"
            min={100}
            max={400}
            step={25}
            value={maxPoints}
            disabled={busy}
            onChange={(e) => setMaxPoints(Number(e.target.value))}
          />
        </div>
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
              <Spinner size={18} /> Generating…
            </>
          ) : (
            "⚡ Generate game"
          )}
        </button>
        <span className="text-xs font-bold text-white/60">{providerLabel}</span>
      </div>

      {busy ? (
        <div className="rounded-2xl border-2 border-dashed border-white/30 bg-white/5 p-4 text-center text-white space-y-2 animate-pulse">
          <p className="text-sm font-extrabold text-lemon">⚡ Creating your AI game…</p>
          <p className="text-xs text-white/70">Connecting to model & preparing studio workspace</p>
          <div className="skeleton h-2 w-3/4 mx-auto bg-white/20" />
        </div>
      ) : null}

      {croppingImage ? (
        <CoverCropperModal
          imageSrc={croppingImage}
          onCrop={(cropped) => {
            setCoverImage(cropped);
            setCroppingImage(null);
          }}
          onCancel={() => setCroppingImage(null)}
        />
      ) : null}
    </section>
  );
}

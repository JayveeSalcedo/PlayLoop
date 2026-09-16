"use client";

/**
 * "What do you want to create?" — the studio's front door.
 *
 * The prompt is the primary way in: the creator describes any game and the AI
 * writes it. The four template games and the runtime's example games are here
 * only as inspiration. A template opens the classic wizard; an example is
 * copied in as an editable starting point. Neither is a type the game has to
 * be — whatever the creator describes is what gets built.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import type { JobView } from "@/lib/generation/jobs";
import { startFromExample } from "./actions";

const MAX_IDEA = 1_000;

/** Ideas that show the range, none of which is one of the templates. */
const SPARKS = [
  "A rhythm game where notes drift toward a beat line and you tap exactly as they cross it",
  "Pilot a tiny spaceship through a procedurally generated asteroid field, collecting stars",
  "Stack falling blocks as high as you can before the tower topples",
  "Enemies chase you around an arena and you can dash by double-tapping",
];

export function StudioStart({ examples }: { examples: { id: string; title: string; hint: string }[] }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy("idea");
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
      setBusy(null);
    }
  }

  async function fork(exampleId: string) {
    setBusy(exampleId);
    setError(null);
    try {
      const { gameId } = await startFromExample(exampleId);
      router.push(`/create/studio/${gameId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start from that example.");
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">What do you want to create?</h1>
      <p className="mt-1 text-sm font-bold text-soft">Describe any short game. The AI writes it, tests it with bots, and fixes what it finds.</p>

      <label htmlFor="idea" className="sr-only">
        Describe your game
      </label>
      <textarea
        id="idea"
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, MAX_IDEA))}
        rows={5}
        placeholder="Describe your game…"
        className="mt-4 w-full rounded-2xl bg-card p-4 font-semibold [border:var(--border-thick)]"
        disabled={working}
        suppressHydrationWarning
      />
      <div className="mt-1 flex justify-between text-xs font-bold text-soft">
        <span>Mechanics, goal, what scores — whatever you have in mind.</span>
        <span>
          {idea.length}/{MAX_IDEA}
        </span>
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}

      <button className="btn go lg block mt-4" onClick={create} disabled={working || !idea.trim()}>
        {busy === "idea" ? (
          <>
            <Spinner size={22} /> Starting…
          </>
        ) : (
          "Make my game"
        )}
      </button>

      <section className="mt-8">
        <h2 className="text-lg font-extrabold">Need inspiration?</h2>
        <div className="mt-3 flex flex-col gap-2">
          {SPARKS.map((spark) => (
            <button
              key={spark}
              className="rounded-2xl bg-card p-3 text-left text-sm font-bold [border:var(--border-thick)]"
              onClick={() => setIdea(spark)}
              disabled={working}
            >
              {spark}
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-sm font-extrabold text-soft">Start from an example game</h3>
        <div className="mt-2 flex flex-col gap-2">
          {examples.map((ex) => (
            <button
              key={ex.id}
              className="card-hard flex items-center justify-between gap-3 rounded-2xl bg-card p-3 text-left [border:var(--border-thick)]"
              onClick={() => fork(ex.id)}
              disabled={working}
            >
              <span>
                <span className="block font-extrabold">{ex.title}</span>
                <span className="block text-xs font-bold text-soft">{ex.hint}</span>
              </span>
              {busy === ex.id ? <Spinner size={22} /> : <span className="text-xs font-extrabold">Copy</span>}
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-sm font-extrabold text-soft">Or build from a classic template</h3>
        <p className="mt-1 text-xs font-bold text-soft">Quiz, Memory, Catch and Reflex, with your own questions and images.</p>
        <Link href="/create/template" className="btn block mt-2">
          Use a template
        </Link>
      </section>

      <Link href="/create/games" className="mt-8 inline-block text-sm font-extrabold underline">
        My games
      </Link>
    </main>
  );
}

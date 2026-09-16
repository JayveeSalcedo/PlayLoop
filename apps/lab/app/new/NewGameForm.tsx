"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STARTER = `playloop.game({
  meta: { title: "Tap the Dot", hint: "Tap the dot before it moves", maxSeconds: 20 },

  init(ctx) {
    return { x: 180, y: 320, r: 34 };
  },

  update(s, input, ctx) {
    for (const tap of input.taps) {
      if (Math.hypot(tap.x - s.x, tap.y - s.y) < s.r) {
        ctx.score(10);
        s.x = ctx.randomInt(40, 320);
        s.y = ctx.randomInt(80, 580);
        s.r = Math.max(16, s.r - 1);
      }
    }
  },

  render(s, g, ctx) {
    g.clear("#3fc8ff");
    g.circle(s.x, s.y, s.r, { fill: "#ffdd3c", stroke: "#18123f", lineWidth: 4 });
  },
});
`;

export function NewGameForm() {
  const router = useRouter();
  const [code, setCode] = useState(STARTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Couldn't save the game.");
      router.push(`/games/${data.id}/report`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="game-code" className="text-sm font-extrabold">
        Game code
      </label>
      <textarea id="game-code" className="lab-code" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
      {error ? (
        <p role="alert" className="card break-words p-3 font-mono text-sm text-ink">
          <b className="font-display">Can&apos;t add this game: </b>
          {error}
        </p>
      ) : null}
      <button className="btn go block" type="button" onClick={save} disabled={busy}>
        {busy ? "Loading it in the sandbox…" : "Save and run checks"}
      </button>
    </div>
  );
}

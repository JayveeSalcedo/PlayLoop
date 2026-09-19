"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateArenaModal } from "./CreateArenaModal";

export interface BrandVenueEventItem {
  id: string;
  code: string;
  title: string;
  venueName: string;
  location: string;
  sponsorName: string;
  accentColor: string;
  prizePoolPoints: number;
  status: string;
  roundsCount: number;
  roundGames: string[];
}

export function BrandArenaSection({
  brandName,
  events,
}: {
  brandName: string;
  events: BrandVenueEventItem[];
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyJoinLink(code: string) {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/events/join?code=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight">Live Arena Activations</h2>
            <span className="rounded-full bg-lemon px-2.5 py-0.5 text-[10px] font-black uppercase text-ink [border:var(--border-thick)]">
              Big-Screen LED Mode
            </span>
          </div>
          <p className="text-xs font-bold text-soft mt-0.5">
            Operate giant screen interactive crowd gaming in malls, sports venues, and brand stages.
          </p>
        </div>
        <CreateArenaModal brandName={brandName} />
      </div>

      {events.length === 0 ? (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-ink/20 bg-card/40 p-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-lemon [border:var(--border-thick)]">
            <span className="text-2xl">🏟️</span>
          </div>
          <p className="font-extrabold text-ink">No custom arena activations created yet</p>
          <p className="text-xs font-bold text-soft mt-1 max-w-md mx-auto">
            Create your first big-screen arena event with custom rounds, sponsor branding, and live crowd prizes.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="card-hard relative flex flex-col justify-between overflow-hidden rounded-3xl bg-card p-5 [border:var(--border-thick)] shadow-sm"
              style={{
                borderLeftWidth: "6px",
                borderLeftColor: evt.accentColor || "#FFDD3C",
              }}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-xl bg-ink px-2.5 py-1 font-mono text-xs font-black uppercase tracking-wider text-paper">
                    {evt.code}
                  </span>
                  <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-extrabold text-ink border border-mint">
                    ● Ready for LED
                  </span>
                </div>

                <h3 className="mt-3 text-base font-black text-ink leading-snug">{evt.title}</h3>
                <p className="text-xs font-bold text-soft mt-0.5">
                  📍 {evt.venueName} · {evt.location}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-extrabold text-ink">
                  <span className="flex items-center gap-1 rounded-lg bg-paper px-2 py-1 border border-ink/10">
                    <span className="coin sm" aria-hidden="true" />
                    <span>{evt.prizePoolPoints.toLocaleString("en-US")} pts budget</span>
                  </span>
                  <span className="rounded-lg bg-paper px-2 py-1 border border-ink/10">
                    🎮 {evt.roundsCount} {evt.roundsCount === 1 ? "Round" : "Rounds"}:{" "}
                    {evt.roundGames.join(" → ")}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
                <Link
                  href={`/events?code=${evt.code}`}
                  target="_blank"
                  className="btn go sm text-xs font-black inline-flex items-center gap-1.5 flex-1 justify-center"
                >
                  <span>▶ Launch LED Screen</span>
                </Link>
                <Link
                  href={`/events/join?code=${evt.code}`}
                  target="_blank"
                  className="btn sm bg-paper text-ink text-xs font-bold hover:bg-ink/5"
                >
                  📱 Mobile Join
                </Link>
                <button
                  type="button"
                  onClick={() => copyJoinLink(evt.code)}
                  className="btn sm bg-paper text-ink text-xs font-bold hover:bg-ink/5"
                  title="Copy QR Join Link"
                >
                  {copiedCode === evt.code ? "✓ Copied!" : "📋 Copy Link"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

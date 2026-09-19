"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVenueEvent } from "./eventActions";
import type { EventRound } from "@/lib/events";

const ACCENT_COLORS = [
  { name: "Lemon", hex: "#FFDD3C", border: "border-black" },
  { name: "Cyan", hex: "#3FC8FF", border: "border-black" },
  { name: "Neon Pink", hex: "#FF5FA2", border: "border-black" },
  { name: "Mint", hex: "#22D39B", border: "border-black" },
  { name: "Violet", hex: "#A78BFA", border: "border-black" },
];

export function CreateArenaModal({ brandName }: { brandName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [arabicTitle, setArabicTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [location, setLocation] = useState("");
  const [sponsorTagline, setSponsorTagline] = useState(`Presented by ${brandName}`);
  const [accentColor, setAccentColor] = useState("#FFDD3C");
  const [prizePoolPoints, setPrizePoolPoints] = useState(5000);

  // Round 1 config
  const [r1Type, setR1Type] = useState<"tap" | "reflex" | "catch">("tap");
  const [r1Duration, setR1Duration] = useState(30);
  const [r1Target, setR1Target] = useState(250);
  const [r1MaxPoints, setR1MaxPoints] = useState(350);

  // Round 2 config
  const [hasRound2, setHasRound2] = useState(true);
  const [r2Type, setR2Type] = useState<"tap" | "reflex" | "catch">("reflex");
  const [r2Duration, setR2Duration] = useState(30);
  const [r2Target, setR2Target] = useState(280);
  const [r2MaxPoints, setR2MaxPoints] = useState(400);

  function generateRandomCode() {
    const prefixes = ["ARENA", "LIVE", "STAGE", "DUBAI", "MALL", "FEST"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 900);
    setCode(`${prefix}-${num}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rounds: EventRound[] = [
      {
        number: 1,
        title: r1Type === "tap" ? "Speed Tap Rush" : r1Type === "reflex" ? "Target Reflex Challenge" : "Token Catcher",
        arabicTitle: r1Type === "tap" ? "سباق السرعة الخارق" : r1Type === "reflex" ? "تحدي سرعة البديهة" : "التقاط الجوائز",
        gameType: r1Type,
        durationSeconds: r1Duration,
        targetScore: r1Target,
        maxPoints: r1MaxPoints,
      },
    ];

    if (hasRound2) {
      rounds.push({
        number: 2,
        title: r2Type === "reflex" ? "Grand Reflex Finals" : r2Type === "catch" ? "Bonus Drop Rush" : "Lightning Tap Frenzy",
        arabicTitle: r2Type === "reflex" ? "نهائي سرعة البديهة الكبير" : r2Type === "catch" ? "جولة الجوائز الإضافية" : "سباق النقر الخاطف",
        gameType: r2Type,
        durationSeconds: r2Duration,
        targetScore: r2Target,
        maxPoints: r2MaxPoints,
      });
    }

    startTransition(async () => {
      try {
        const result = await createVenueEvent({
          code,
          title,
          arabicTitle: arabicTitle || undefined,
          venueName,
          location,
          sponsorTagline,
          accentColor,
          prizePoolPoints,
          rounds,
        });

        setIsOpen(false);
        router.refresh();
        // Optional quick open
        window.open(`/events?code=${result.code}`, "_blank");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create arena activation");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => {
          if (!code) generateRandomCode();
          setIsOpen(true);
        }}
        className="btn go sm inline-flex items-center gap-1.5"
      >
        <span>+ New Arena Activation</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card-hard max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl [border:var(--border-thick)]">
            <div className="flex items-center justify-between border-b-2 border-ink/10 pb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-soft">LED Stage & Wall Mode</p>
                <h2 className="text-xl font-black text-ink">Create Arena Activation</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-paper font-black text-ink hover:bg-ink/10"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-gum/15 p-3 text-sm font-extrabold text-gum border border-gum/30">
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Join Code & Generator */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                  Crowd Join Code (Shown on LED Big Screen)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HILLS-LIVE"
                    required
                    maxLength={20}
                    className="input-hard flex-1 font-mono uppercase font-black"
                  />
                  <button
                    type="button"
                    onClick={generateRandomCode}
                    className="btn sm bg-paper text-ink font-bold hover:bg-ink/5"
                  >
                    🎲 Random
                  </button>
                </div>
                <p className="text-[11px] font-bold text-soft mt-1">
                  Spectators scan the screen QR or navigate to playloop.ae/events/join?code={code || "CODE"}
                </p>
              </div>

              {/* Event Title & Venue Name */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Event Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Dubai Hills Weekend Cup"
                    required
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Venue Name
                  </label>
                  <input
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="e.g. Dubai Hills Mall Arena"
                    required
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
              </div>

              {/* Screen Location & Arabic Title */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Screen Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Central Atrium Mega LED Wall"
                    required
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Arabic Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={arabicTitle}
                    onChange={(e) => setArabicTitle(e.target.value)}
                    placeholder="بطولة دبي هيلز لايف"
                    dir="rtl"
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
              </div>

              {/* Sponsor Tagline & Prize Pool */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Sponsor Tagline
                  </label>
                  <input
                    type="text"
                    value={sponsorTagline}
                    onChange={(e) => setSponsorTagline(e.target.value)}
                    placeholder={`Presented by ${brandName}`}
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1">
                    Prize Pool Points
                  </label>
                  <input
                    type="number"
                    value={prizePoolPoints}
                    onChange={(e) => setPrizePoolPoints(Number(e.target.value))}
                    min={500}
                    max={1000000}
                    step={500}
                    className="input-hard w-full text-sm font-bold"
                  />
                </div>
              </div>

              {/* Accent Color Picker */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-soft mb-1.5">
                  Arena LED Accent Color
                </label>
                <div className="flex items-center gap-3">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAccentColor(c.hex)}
                      className={`h-8 w-8 rounded-full transition-transform [border:var(--border-thick)] ${
                        accentColor === c.hex ? "scale-125 ring-2 ring-black ring-offset-2" : "opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <span className="text-xs font-extrabold text-soft ml-2">
                    {ACCENT_COLORS.find((c) => c.hex === accentColor)?.name} Theme
                  </span>
                </div>
              </div>

              {/* Round 1 Configuration */}
              <div className="rounded-2xl bg-paper p-3.5 border border-ink/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-ink">ROUND 1: QUALIFYING</span>
                  <span className="rounded-full bg-lemon px-2 py-0.5 text-[10px] font-black">Mandatory</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="block text-[10px] font-black text-soft mb-0.5">Game</label>
                    <select
                      value={r1Type}
                      onChange={(e) => setR1Type(e.target.value as "tap" | "reflex" | "catch")}
                      className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                    >
                      <option value="tap">⚡ Speed Tap</option>
                      <option value="reflex">🎯 Reflex Matrix</option>
                      <option value="catch">☕ Catch Rush</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-soft mb-0.5">Duration</label>
                    <select
                      value={r1Duration}
                      onChange={(e) => setR1Duration(Number(e.target.value))}
                      className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                    >
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={45}>45 seconds</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-soft mb-0.5">Target</label>
                    <input
                      type="number"
                      value={r1Target}
                      onChange={(e) => setR1Target(Number(e.target.value))}
                      className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-soft mb-0.5">Max Pts</label>
                    <input
                      type="number"
                      value={r1MaxPoints}
                      onChange={(e) => setR1MaxPoints(Number(e.target.value))}
                      className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Round 2 Configuration */}
              <div className="rounded-2xl bg-paper p-3.5 border border-ink/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-ink">ROUND 2: CHAMPIONSHIP FINALS</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasRound2}
                      onChange={(e) => setHasRound2(e.target.checked)}
                      className="rounded border-ink"
                    />
                    <span className="text-xs font-bold text-ink">Enable</span>
                  </label>
                </div>
                {hasRound2 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className="block text-[10px] font-black text-soft mb-0.5">Game</label>
                      <select
                        value={r2Type}
                        onChange={(e) => setR2Type(e.target.value as "tap" | "reflex" | "catch")}
                        className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                      >
                        <option value="reflex">🎯 Reflex Matrix</option>
                        <option value="tap">⚡ Speed Tap</option>
                        <option value="catch">☕ Catch Rush</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-soft mb-0.5">Duration</label>
                      <select
                        value={r2Duration}
                        onChange={(e) => setR2Duration(Number(e.target.value))}
                        className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                      >
                        <option value={20}>20 seconds</option>
                        <option value={30}>30 seconds</option>
                        <option value={45}>45 seconds</option>
                        <option value={60}>60 seconds</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-soft mb-0.5">Target</label>
                      <input
                        type="number"
                        value={r2Target}
                        onChange={(e) => setR2Target(Number(e.target.value))}
                        className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-soft mb-0.5">Max Pts</label>
                      <input
                        type="number"
                        value={r2MaxPoints}
                        onChange={(e) => setR2MaxPoints(Number(e.target.value))}
                        className="w-full rounded-lg border border-ink/20 bg-card px-2 py-1 text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink/10">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn sm bg-paper text-ink hover:bg-ink/5"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn go sm inline-flex items-center gap-2"
                >
                  {isPending ? "Creating Arena..." : "🚀 Launch & Save Activation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

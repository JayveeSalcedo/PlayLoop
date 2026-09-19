"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { avatar, icon } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";
import type { VenueEventConfig } from "@/lib/events";
import { arenaAudio } from "@/lib/arenaAudio";
import { creditEventRoundPoints } from "../actions";

interface PlayerData {
  profileId: string;
  name: string;
  avatarIndex: number;
  onePassId: string;
  pointsBalance: number;
  isGuest: boolean;
}

interface TargetItem {
  id: number;
  x: number;
  y: number;
  points: number;
  isGold: boolean;
  expiresAt: number;
}

export function EventMobileClient({
  initialPlayer,
  event,
}: {
  initialPlayer: PlayerData;
  event: VenueEventConfig;
}) {
  const router = useRouter();
  const [player, setPlayer] = useState(initialPlayer);
  const [status, setStatus] = useState<"lobby" | "playing" | "round_done" | "wrap">("lobby");
  const [roundIdx, setRoundIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [lastAwarded, setLastAwarded] = useState<{ points: number; rank: number; newBalance: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [floaters, setFloaters] = useState<{ id: number; text: string; x: number; y: number }[]>([]);
  const [soundMuted, setSoundMuted] = useState(() => arenaAudio.isMuted());
  const [showConnectedModal, setShowConnectedModal] = useState(true);
  const [showPodiumModal, setShowPodiumModal] = useState(false);

  const round = event.rounds[roundIdx] ?? event.rounds[0]!;
  const targetIdRef = useRef(0);
  const floaterIdRef = useRef(0);

  // Spawning targets during "playing"
  useEffect(() => {
    if (status !== "playing") return;

    const interval = setInterval(() => {
      const isGold = Math.random() < 0.25;
      const pts = isGold ? 25 : 10;
      const newTarget: TargetItem = {
        id: ++targetIdRef.current,
        x: 10 + Math.random() * 75,
        y: 15 + Math.random() * 65,
        points: pts,
        isGold,
        expiresAt: Date.now() + 1800,
      };

      setTargets((prev) => [...prev.filter((t) => t.expiresAt > Date.now()), newTarget]);
    }, 450);

    return () => clearInterval(interval);
  }, [status]);

  const handleRoundFinish = useCallback(
    async (finalScore: number) => {
      setStatus("round_done");
      setIsSubmitting(true);

      const calculatedRank =
        finalScore > 280
          ? 1
          : finalScore > 200
          ? 2
          : finalScore > 150
          ? 3
          : Math.min(12, Math.max(4, Math.floor(25 - finalScore / 15)));

      try {
        const res = await creditEventRoundPoints({
          eventCode: event.code,
          roundNumber: round.number,
          score: finalScore,
          rank: calculatedRank,
        });

        arenaAudio.playVictory();

        if (res.ok) {
          setLastAwarded({
            points: res.pointsAwarded,
            rank: calculatedRank,
            newBalance: res.newBalance,
          });
          setPlayer((prev) => ({ ...prev, pointsBalance: res.newBalance }));
          if (calculatedRank <= 3) {
            setShowPodiumModal(true);
          }
        }
      } catch {
        arenaAudio.playVictory();
        setLastAwarded({
          points: Math.max(25, Math.floor(finalScore * 0.8)),
          rank: calculatedRank,
          newBalance: player.pointsBalance + 150,
        });
        if (calculatedRank <= 3) {
          setShowPodiumModal(true);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [event.code, round.number, player.pointsBalance],
  );

  // Round countdown timer
  useEffect(() => {
    if (status !== "playing") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleRoundFinish(score);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, handleRoundFinish, score]);

  const handleStartPlay = () => {
    setScore(0);
    setCombo(0);
    setTimeLeft(round.durationSeconds || 30);
    setTargets([]);
    arenaAudio.playCountdown(true);
    setStatus("playing");
  };

  const handleTargetHit = (target: TargetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const multiplier = combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
    const added = target.points * multiplier;
    setScore((s) => s + added);
    setCombo((c) => c + 1);

    arenaAudio.playTap();
    if (multiplier > 1) {
      arenaAudio.playCombo(combo + 1);
    }

    // Remove hit target
    setTargets((prev) => prev.filter((t) => t.id !== target.id));

    // Show floating score
    const newFloater = {
      id: ++floaterIdRef.current,
      text: `+${added}${multiplier > 1 ? ` (${multiplier}x)` : ""}`,
      x: target.x,
      y: target.y,
    };
    setFloaters((prev) => [...prev.slice(-6), newFloater]);
    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== newFloater.id));
    }, 800);
  };

  const handleMiss = () => {
    setCombo(0);
  };

  const handleNextRoundOrWrap = () => {
    if (roundIdx + 1 < event.rounds.length) {
      setRoundIdx((i) => i + 1);
      setStatus("lobby");
    } else {
      setStatus("wrap");
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0820] text-white flex flex-col items-center justify-between p-4 max-w-md mx-auto relative overflow-hidden font-sans select-none">
      {/* Background ambient neon glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-violet-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="w-full flex items-center justify-between z-10 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-extrabold tracking-tight text-sm text-yellow-300">PLAYLOOP LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const muted = arenaAudio.toggleMute();
              setSoundMuted(muted);
            }}
            className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-extrabold text-white hover:bg-white/20 transition-colors"
          >
            {!soundMuted ? "🔊 ON" : "🔇 OFF"}
          </button>
          <div className="text-right">
            <div className="text-xs font-bold text-white/90">{event.venueName}</div>
            <div className="text-[10px] text-white/60">{event.sponsorTagline}</div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="w-full flex-1 flex flex-col justify-center py-6 z-10">
        {status === "lobby" && (
          <div className="space-y-4 text-center">
            {/* Player Profile Badge */}
            <div className="bg-white/10 border-2 border-white/20 rounded-2xl p-4 backdrop-blur-md flex items-center gap-4 text-left shadow-lg">
              <div
                className="w-14 h-14 rounded-xl border-2 border-yellow-400 p-0.5 bg-ink flex-shrink-0 flex items-center justify-center overflow-hidden"
                dangerouslySetInnerHTML={{ __html: avatar(player.avatarIndex, 50) }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-lg text-white truncate">{player.name}</h2>
                  <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded bg-yellow-400 text-ink">
                    Round {round.number}
                  </span>
                </div>
                <div className="text-xs text-yellow-300 font-mono tracking-wide">{player.onePassId}</div>
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Linked • Wallet:</span>
                  <span className="inline-flex items-center gap-1 text-white font-bold">
                    <span className="coin sm" aria-hidden="true" />
                    {player.pointsBalance.toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>

            {/* Venue Verification Card */}
            <div className="bg-emerald-950/50 border-2 border-emerald-500/50 rounded-xl p-3 text-left flex items-start gap-2.5">
              <span className="text-emerald-400 text-lg leading-none font-bold">✓</span>
              <div>
                <div className="text-xs font-bold text-emerald-300">Venue check verified</div>
                <div className="text-[11px] text-emerald-200/80">
                  Inside {event.venueName} geofence on mall Wi-Fi. Live scores sync to big-screen LED.
                </div>
              </div>
            </div>

            {/* Round info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2">
              <div className="text-xs uppercase font-extrabold tracking-wider text-yellow-300">
                {round.title} ({round.durationSeconds}s)
              </div>
              <div className="text-sm font-semibold text-white/80">
                Tap the appearing tokens as fast as you can. Build combos to multiply your score and reach the big-screen podium!
              </div>
            </div>

            {/* Play Button */}
            <button
              onClick={handleStartPlay}
              className="w-full py-4 px-6 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-ink font-black text-xl shadow-[0_6px_0_#18123F] active:translate-y-1 active:shadow-[0_2px_0_#18123F] transition-all flex items-center justify-center gap-2"
            >
              <span>⚡ READY — START ROUND</span>
            </button>

            <p className="text-[12px] text-white/50">
              Score appears live on the big LED wall.
            </p>
          </div>
        )}

        {status === "playing" && (
          <div className="flex-1 flex flex-col justify-between h-full">
            {/* Game HUD */}
            <div className="flex items-center justify-between bg-white/10 backdrop-blur rounded-2xl px-4 py-2 border border-white/20 mb-3">
              <div>
                <div className="text-[10px] text-white/60 font-bold uppercase">Your Score</div>
                <div className="text-3xl font-black text-yellow-300 tracking-tight">{score}</div>
              </div>
              {combo > 2 && (
                <div className="bg-gradient-to-r from-pink-500 to-violet-500 px-3 py-1 rounded-full text-xs font-black text-white animate-pulse">
                  {combo}x COMBO!
                </div>
              )}
              <div className="text-right">
                <div className="text-[10px] text-white/60 font-bold uppercase">Time Left</div>
                <div className={`text-3xl font-black font-mono ${timeLeft <= 5 ? "text-red-400 animate-ping" : "text-white"}`}>
                  {timeLeft}s
                </div>
              </div>
            </div>

            {/* Interactive Game Play Area */}
            <div
              onClick={handleMiss}
              className="relative flex-1 min-h-[360px] bg-white/5 border-2 border-dashed border-white/20 rounded-3xl overflow-hidden cursor-crosshair touch-manipulation shadow-inner"
            >
              {/* Tap hint when empty */}
              {targets.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white/40 font-bold text-sm pointer-events-none">
                  Tokens appearing...
                </div>
              )}

              {/* Floating targets */}
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={(e) => handleTargetHit(t, e)}
                  style={{ left: `${t.x}%`, top: `${t.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black transition-transform active:scale-90 border-3 border-ink shadow-[0_4px_0_#18123F] animate-in zoom-in-75 duration-150 ${
                    t.isGold
                      ? "bg-yellow-400 text-ink scale-110 ring-4 ring-yellow-300/50"
                      : "bg-pink-500 text-white"
                  }`}
                >
                  {t.isGold ? (
                    <span className="coin md" style={{ boxShadow: "none" }} aria-hidden="true" />
                  ) : (
                    <span className="text-xl leading-none">☕</span>
                  )}
                  <span className="text-[11px] font-black leading-none mt-1">+{t.points}</span>
                </button>
              ))}

              {/* Floating score badges */}
              {floaters.map((f) => (
                <div
                  key={f.id}
                  style={{ left: `${f.x}%`, top: `${f.y}%` }}
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-6 text-yellow-300 font-black text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-out fade-out slide-out-to-top-4 duration-700"
                >
                  {f.text}
                </div>
              ))}
            </div>

            <div className="text-center text-xs text-white/60 mt-3">
              Tap tokens quickly before they disappear! Avoid missing to keep your combo alive.
            </div>
          </div>
        )}

        {status === "round_done" && (
          <div className="space-y-4 text-center">
            <div className="text-sm uppercase font-bold text-emerald-400 tracking-wider">
              Round {round.number} Complete!
            </div>

            {/* Rank badge */}
            <div className="bg-white/10 border-2 border-white/20 rounded-3xl p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
              <div className="text-xs text-white/60 font-bold uppercase mb-1">Final Standing</div>
              <div className="text-6xl font-black text-yellow-400 tracking-tight">
                #{lastAwarded?.rank ?? 1}
              </div>
              <div className="text-xs text-white/70 mt-1 font-semibold">
                Score: <span className="text-white font-extrabold">{score} pts</span>
              </div>

              {/* Wallet payout notification */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="bg-yellow-400 text-ink font-black text-base py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-[0_3px_0_#18123F]">
                  <span className="coin sm" aria-hidden="true" />
                  <span>+{lastAwarded?.points ?? 240} points saved to OnePass!</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/70 mt-2">
                  <span>Credited directly to {player.onePassId} • New balance:</span>
                  <span className="inline-flex items-center gap-1 text-yellow-300 font-bold">
                    <span className="coin sm" aria-hidden="true" />
                    {player.pointsBalance.toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>

            {/* Podium message */}
            <div className="bg-violet-900/40 border border-violet-500/40 rounded-2xl p-4 text-left text-xs text-white/80 space-y-1">
              <div className="font-extrabold text-violet-300">Look up at the big screen!</div>
              <div>The host is presenting the 3D podium ceremony with 1st, 2nd, and 3rd place winners.</div>
            </div>

            {/* Next Step Button */}
            <button
              onClick={handleNextRoundOrWrap}
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-white/90 text-ink font-black text-lg shadow-[0_5px_0_#18123F] active:translate-y-1 transition-all"
            >
              {roundIdx + 1 < event.rounds.length ? "NEXT ROUND →" : "VIEW FINAL RECAP →"}
            </button>
          </div>
        )}

        {status === "wrap" && (
          <div className="space-y-5 text-center">
            <div className="inline-block px-3 py-1 rounded-full bg-yellow-400 text-ink font-black text-xs uppercase tracking-wider">
              Activation Complete
            </div>
            <h2 className="text-3xl font-black text-white leading-tight">
              Thanks for playing at {event.venueName}!
            </h2>

            <div className="bg-white/10 border-2 border-white/20 rounded-3xl p-6 backdrop-blur-md space-y-3">
              <div className="text-sm text-white/70 font-semibold">Total Event Points in Wallet</div>
              <div className="flex items-center justify-center gap-3 text-5xl font-black text-yellow-400">
                <span className="coin lg" aria-hidden="true" />
                <span>{player.pointsBalance.toLocaleString()}</span>
              </div>
              <div className="text-xs text-emerald-400 font-bold">
                ✓ Ready to spend on vouchers, coffee &amp; rewards
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Link
                href="/feed"
                className="block w-full py-4 px-6 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-ink font-black text-lg shadow-[0_5px_0_#18123F] active:translate-y-1 transition-all"
              >
                KEEP PLAYING IN PLAYLOOP
              </Link>
              <Link
                href="/wallet"
                className="block w-full py-3 px-6 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all"
              >
                Open My Wallet & Vouchers
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-[10px] text-white/40 py-2 border-t border-white/10">
        PlayLoop Live LED Venue Mode • OnePass ID {player.onePassId}
      </footer>

      {/* Handshake: Connected to Big Screen Modal */}
      {status === "lobby" && showConnectedModal && (
        <SuccessModal
          isOpen={showConnectedModal}
          onClose={() => setShowConnectedModal(false)}
          title="Connected to Arena Big-Screen!"
          badgeText="Venue Handshake Verified"
          iconHtml={icon("spark")}
          accentColor="mint"
          confetti={false}
          soundEffect="tap"
          primaryAction={{
            label: "Enter Player Lobby",
            onClick: () => setShowConnectedModal(false),
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <div className="flex justify-between items-center text-xs font-bold text-soft">
                <span>Venue Location</span>
                <span className="font-extrabold text-ink">{event.venueName}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-soft mt-1">
                <span>Event PIN</span>
                <span className="font-mono font-extrabold text-ink">{event.code}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-soft mt-1">
                <span>OnePass ID</span>
                <span className="font-mono font-extrabold text-ink">{player.onePassId}</span>
              </div>
            </div>
            <p className="text-xs text-soft font-semibold text-center">
              Look up at the LED wall to see your avatar in the lobby! When the host triggers the countdown, tap tokens quickly to reach the podium.
            </p>
          </div>
        </SuccessModal>
      )}

      {/* Podium Finish Celebration Modal */}
      {showPodiumModal && (
        <SuccessModal
          isOpen={showPodiumModal}
          onClose={() => setShowPodiumModal(false)}
          title={`🏆 PODIUM FINISH! #${lastAwarded?.rank ?? 1} PLACE`}
          badgeText="Live Arena Ceremony"
          iconHtml={icon("trophy")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Claim Venue Voucher in Wallet",
            onClick: () => {
              router.push("/wallet");
            },
          }}
          secondaryAction={{
            label: roundIdx + 1 < event.rounds.length ? "Next Round" : "View Final Recap",
            onClick: () => {
              setShowPodiumModal(false);
              handleNextRoundOrWrap();
            },
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-full rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
              <span className="text-xs font-bold text-soft uppercase tracking-wider">Podium Ranking</span>
              <p className="text-5xl font-black text-ink my-1">#{lastAwarded?.rank ?? 1}</p>
              <p className="text-xs font-bold text-mint-foreground">+{lastAwarded?.points ?? 240} points credited to OnePass</p>
            </div>
            <p className="text-xs font-semibold text-soft">
              Outstanding performance! Look up at the big LED screen to watch the 3D Neobrutalist Podium awards ceremony.
            </p>
          </div>
        </SuccessModal>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { avatar } from "@playloop/ui";
import {
  VENUE_EVENTS,
  generateSimulatedPlayer,
  type CrowdPlayer,
  type VenueEventConfig,
} from "@/lib/events";
import { EventMobileClient } from "./join/EventMobileClient";

type ArenaState = "idle" | "lobby" | "round" | "results" | "recap";

export function EventArenaClient({
  initialEvent,
  initialQrSvg,
  initialHostPlayer,
}: {
  initialEvent: VenueEventConfig;
  initialQrSvg: string;
  initialHostPlayer: {
    profileId: string;
    name: string;
    avatarIndex: number;
    onePassId: string;
    pointsBalance: number;
    isGuest: boolean;
  };
}) {
  const [selectedEventCode, setSelectedEventCode] = useState(initialEvent.code);
  const currentEvent = VENUE_EVENTS[selectedEventCode] ?? initialEvent;

  const [state, setState] = useState<ArenaState>("idle");
  const [roundIndex, setRoundIndex] = useState(0);
  const [players, setPlayers] = useState<CrowdPlayer[]>([]);
  const [tickerMessage, setTickerMessage] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [countdownNum, setCountdownNum] = useState<string | null>(null);
  const [showCompanion, setShowCompanion] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoSimulate, setAutoSimulate] = useState(true);

  const currentRound = currentEvent.rounds[roundIndex] ?? currentEvent.rounds[0]!;

  const wallRef = useRef<HTMLDivElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const roundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scoreTickRef = useRef<NodeJS.Timeout | null>(null);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!wallRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wallRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  // Confetti effect helper
  const triggerConfetti = useCallback(() => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 1280;
    canvas.height = canvas.parentElement?.clientHeight || 720;

    const colors = ["#FFDD3C", "#3FC8FF", "#FF5FA2", "#22D39B", "#FFFFFF", "#FF7A1A"];
    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 50,
      size: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      vx: (Math.random() - 0.5) * 6,
      vy: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
    }));

    let frame = 0;
    const anim = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;
        if (p.y < canvas.height + 20) alive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      frame++;
      if (alive && frame < 180) {
        requestAnimationFrame(anim);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(anim);
  }, []);

  // Action handlers
  const handleOpenLobby = useCallback(() => {
    setState("lobby");
    setPlayers([]);
    const initialBatch = Array.from({ length: 14 }, (_, i) => generateSimulatedPlayer(i));
    initialBatch.push({
      id: initialHostPlayer.profileId,
      name: `${initialHostPlayer.name} (Host)`,
      avatarIndex: initialHostPlayer.avatarIndex,
      skill: 1.15,
      score: 0,
      totalScore: 0,
      isMe: true,
    });
    setPlayers(initialBatch);
    setTickerMessage(`✨ ${initialHostPlayer.name} connected as Host player`);
  }, [initialHostPlayer]);

  const handleStartRound = useCallback(() => {
    setPlayers((prev) => prev.map((p) => ({ ...p, score: 0 })));
    setTimeLeft(currentRound.durationSeconds);
    setState("round");
    setCountdownNum("3");
    setTimeout(() => setCountdownNum("2"), 700);
    setTimeout(() => setCountdownNum("1"), 1400);
    setTimeout(() => setCountdownNum("GO!"), 2100);
    setTimeout(() => setCountdownNum(null), 2700);
  }, [currentRound.durationSeconds]);

  const handleRoundEnd = useCallback(() => {
    if (scoreTickRef.current) clearInterval(scoreTickRef.current);
    if (roundTimerRef.current) clearInterval(roundTimerRef.current);

    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        totalScore: p.totalScore + p.score,
      }))
    );

    setState("results");
    setTimeout(() => {
      triggerConfetti();
    }, 300);
  }, [triggerConfetti]);

  const handleAdvanceToNextOrRecap = useCallback(() => {
    if (roundIndex + 1 < currentEvent.rounds.length) {
      setRoundIndex((i) => i + 1);
      handleStartRound();
    } else {
      setState("recap");
      setTimeout(() => {
        triggerConfetti();
      }, 300);
    }
  }, [roundIndex, currentEvent.rounds.length, handleStartRound, triggerConfetti]);

  const handleReset = useCallback(() => {
    if (scoreTickRef.current) clearInterval(scoreTickRef.current);
    if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    setState("idle");
    setRoundIndex(0);
    setPlayers([]);
    setTickerMessage("");
    setTimeLeft(30);
  }, []);

  const handleAdvanceState = useCallback(() => {
    if (state === "idle") handleOpenLobby();
    else if (state === "lobby") handleStartRound();
    else if (state === "round") handleRoundEnd();
    else if (state === "results") handleAdvanceToNextOrRecap();
    else if (state === "recap") handleReset();
  }, [state, handleOpenLobby, handleStartRound, handleRoundEnd, handleAdvanceToNextOrRecap, handleReset]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === " ") {
        e.preventDefault();
        handleAdvanceState();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen, handleAdvanceState]);

  // Add players to lobby
  const addCrowdPlayers = useCallback((count: number) => {
    setPlayers((prev) => {
      const nextIndex = prev.length;
      const newBatch: CrowdPlayer[] = [];
      for (let i = 0; i < count; i++) {
        newBatch.push(generateSimulatedPlayer(nextIndex + i));
      }
      const newest = newBatch[newBatch.length - 1];
      if (newest) {
        setTickerMessage(`✨ ${newest.name} joined the arena`);
      }
      return [...prev, ...newBatch];
    });
  }, []);

  // Lobby auto-simulation
  useEffect(() => {
    if (state === "lobby" && autoSimulate) {
      simIntervalRef.current = setInterval(() => {
        setPlayers((prev) => {
          if (prev.length >= 64) {
            if (simIntervalRef.current) clearInterval(simIntervalRef.current);
            return prev;
          }
          const p = generateSimulatedPlayer(prev.length);
          setTickerMessage(`✨ ${p.name} joined the arena`);
          return [...prev, p];
        });
      }, 750);
    } else if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
    }
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [state, autoSimulate]);

  // Round game ticking (live scoring + countdown)
  useEffect(() => {
    if (state !== "round") return;

    // Score simulation ticking
    scoreTickRef.current = setInterval(() => {
      setPlayers((prev) =>
        prev.map((p) => {
          const gain = Math.floor(p.skill * (Math.random() * 14 + 4));
          return { ...p, score: p.score + gain };
        })
      );
    }, 400);

    // 1-second countdown
    roundTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleRoundEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (scoreTickRef.current) clearInterval(scoreTickRef.current);
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    };
  }, [state, roundIndex, currentRound.durationSeconds, handleRoundEnd]);

  // Sorted players for leaderboard & podium
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(1, sortedPlayers[0]?.score || 1);
  const crowdScoreTotal = players.reduce((sum, p) => sum + p.score, 0);

  const firstPlace = sortedPlayers[0];
  const secondPlace = sortedPlayers[1];
  const thirdPlace = sortedPlayers[2];

  // 30-second circular progress stroke
  const strokeRadius = 46;
  const strokeCircumference = 2 * Math.PI * strokeRadius;
  const strokeOffset =
    strokeCircumference * (1 - timeLeft / (currentRound.durationSeconds || 30));

  return (
    <div className="min-h-screen bg-[#070414] text-white p-4 md:p-6 flex flex-col items-center justify-start font-sans select-none">
      {/* Top Breadcrumbs & Control Bar */}
      <div className="w-full max-w-7xl flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4 text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/feed"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
          >
            ← Back to App
          </Link>
          <span className="text-white/40">/</span>
          <span className="font-extrabold text-yellow-300 text-sm tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            PLAYLOOP ARENA CONTROLLER
          </span>
        </div>

        {/* Venue Preset Selector & Companion Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-white/5 border border-white/15 rounded-xl p-1 gap-1">
            {Object.values(VENUE_EVENTS).map((ev) => (
              <button
                key={ev.code}
                onClick={() => {
                  setSelectedEventCode(ev.code);
                  handleReset();
                }}
                className={`px-3 py-1 rounded-lg font-extrabold text-xs transition-colors ${
                  selectedEventCode === ev.code
                    ? "bg-yellow-400 text-ink shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {ev.venueName}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCompanion((s) => !s)}
            className={`px-3 py-1.5 rounded-xl font-extrabold text-xs border transition-colors ${
              showCompanion
                ? "bg-violet-600 border-violet-400 text-white"
                : "bg-white/5 border-white/15 text-white/70 hover:text-white"
            }`}
          >
            📱 Companion Phone: {showCompanion ? "ON" : "OFF"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-xs flex items-center gap-1.5 transition-colors"
          >
            ⛶ Fullscreen (F)
          </button>
        </div>
      </div>

      {/* Main Stage Grid: 16:9 LED Wall + Companion Phone */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* The 16:9 Big-Screen LED Wall Container */}
        <div
          ref={wallRef}
          className={`relative bg-[#0B0820] border-4 border-ink rounded-3xl overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_0_2px_rgba(255,255,255,0.1)] flex flex-col justify-between ${
            showCompanion ? "lg:col-span-8" : "lg:col-span-12"
          } ${
            isFullscreen
              ? "!fixed !inset-0 !w-screen !h-screen !rounded-none !border-none !z-50 aspect-auto"
              : "aspect-[16/9] w-full"
          }`}
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, rgba(91, 59, 255, 0.12) 0%, transparent 80%), radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.5px)",
            backgroundSize: "100% 100%, 24px 24px",
          }}
        >
          {/* Confetti Overlay Canvas */}
          <canvas
            ref={confettiCanvasRef}
            className="absolute inset-0 pointer-events-none z-30 w-full h-full"
          />

          {/* 3-2-1 Countdown Overlay */}
          {countdownNum && (
            <div className="absolute inset-0 bg-ink/75 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
              <span className="text-[120px] md:text-[180px] font-black tracking-tighter text-yellow-300 drop-shadow-[0_12px_0_#18123F] animate-in zoom-in-50 duration-200">
                {countdownNum}
              </span>
            </div>
          )}

          {/* LED Header Bar */}
          <div className="p-6 md:p-8 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-ink font-black flex items-center justify-center text-xl shadow-[0_4px_0_#18123F]">
                ▶
              </div>
              <div className="flex items-center gap-2 font-black text-2xl md:text-3xl tracking-tight text-white">
                playloop
                <span className="text-xs uppercase px-2 py-0.5 rounded-md bg-pink-500 text-white font-extrabold border-2 border-ink">
                  LIVE
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl md:text-2xl font-black text-white leading-tight">
                {currentEvent.title}
              </div>
              <div className="text-xs md:text-sm font-bold text-yellow-300">
                {currentEvent.sponsorTagline}
              </div>
            </div>
          </div>

          {/* LED Body — State Dependent Screens */}
          <div className="flex-1 px-8 py-4 flex flex-col justify-center items-center z-10">
            {/* STATE 1: IDLE */}
            {state === "idle" && (
              <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-2xl">
                <div className="inline-block px-8 py-3 rounded-2xl bg-yellow-400 text-ink font-black text-3xl md:text-4xl -rotate-2 border-4 border-ink shadow-[0_8px_0_#18123F]">
                  STARTING SOON
                </div>
                <p className="text-2xl md:text-3xl font-extrabold text-white/90 leading-snug">
                  Scan the big screen, join with OnePass, and compete for live venue prizes tonight.
                </p>
                <div className="flex items-center gap-3 text-sm font-bold text-white/60 bg-white/10 px-5 py-2 rounded-full border border-white/20">
                  <span>📍 {currentEvent.venueName}</span>
                  <span>•</span>
                  <span>{currentEvent.location}</span>
                </div>
              </div>
            )}

            {/* STATE 2: LOBBY */}
            {state === "lobby" && (
              <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center h-full">
                {/* Left: Big QR Code Box */}
                <div className="md:col-span-5 flex flex-col items-center text-center">
                  <div className="bg-white p-4 rounded-3xl border-4 border-ink shadow-[0_12px_0_#FFDD3C] w-64 h-64 md:w-72 md:h-72 flex items-center justify-center">
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: initialQrSvg }}
                    />
                  </div>
                  <div className="mt-4 text-3xl md:text-4xl font-black tracking-tight text-white">
                    Scan to Play
                  </div>
                  <div className="text-sm font-mono text-yellow-300 font-bold bg-white/10 px-3 py-1 rounded-full mt-1">
                    code: {currentEvent.code}
                  </div>
                </div>

                {/* Right: Live Crowd Counter & Avatar Mosaic */}
                <div className="md:col-span-7 flex flex-col justify-center space-y-3">
                  <div className="text-sm md:text-base font-bold uppercase tracking-widest text-white/70">
                    PLAYERS IN ARENA
                  </div>
                  <div className="text-8xl md:text-9xl font-black tracking-tighter text-yellow-300 leading-none drop-shadow-[0_8px_0_#18123F]">
                    {players.length}
                  </div>

                  {/* Avatar Mosaic (Last 36 joining players) */}
                  <div className="grid grid-cols-8 md:grid-cols-10 gap-2 py-3 max-h-36 overflow-hidden">
                    {players.slice(-30).map((p, idx) => (
                      <div
                        key={`${p.id}-${idx}`}
                        className="w-10 h-10 rounded-xl bg-ink border-2 border-white/20 flex items-center justify-center overflow-hidden animate-in zoom-in duration-200 shadow-sm"
                        dangerouslySetInnerHTML={{ __html: avatar(p.avatarIndex, 36) }}
                      />
                    ))}
                  </div>

                  {/* Live Join Ticker */}
                  <div className="text-sm font-bold text-emerald-400 h-6 flex items-center gap-2">
                    {tickerMessage || "Waiting for spectators to scan..."}
                  </div>
                </div>
              </div>
            )}

            {/* STATE 3: ROUND */}
            {state === "round" && (
              <div className="w-full h-full flex flex-col justify-between">
                {/* Round Header & Circular Timer */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs uppercase font-extrabold text-yellow-300 tracking-wider">
                      Round {roundIndex + 1} of {currentEvent.rounds.length}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-black text-white">
                      {currentRound.title}
                    </h2>
                  </div>

                  {/* Circular Timer */}
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r={strokeRadius}
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={strokeRadius}
                        stroke="#FFDD3C"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={strokeCircumference}
                        strokeDashoffset={strokeOffset}
                        fill="transparent"
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <span className="absolute font-black text-2xl text-white font-mono">
                      {timeLeft}
                    </span>
                  </div>
                </div>

                {/* Main Section: Top 8 Leaderboard Bars + Side KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 items-center">
                  {/* Left: Top 8 Rows */}
                  <div className="md:col-span-8 space-y-2">
                    {sortedPlayers.slice(0, 8).map((p, idx) => {
                      const pct = Math.min(100, Math.max(8, (p.score / maxScore) * 100));
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 ${
                            p.isMe
                              ? "bg-yellow-400 border-ink text-ink shadow-[0_3px_0_#18123F]"
                              : "bg-white/10 border-white/10 text-white"
                          }`}
                        >
                          <span
                            className={`w-6 text-center font-black text-sm ${
                              p.isMe ? "text-ink" : "text-yellow-400"
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div
                            className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0"
                            dangerouslySetInnerHTML={{ __html: avatar(p.avatarIndex, 28) }}
                          />
                          <span className="w-28 truncate font-extrabold text-xs">{p.name}</span>
                          <div className="flex-1 h-3 rounded-full bg-black/25 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                p.isMe ? "bg-violet-600" : "bg-emerald-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-16 text-right font-black font-mono text-sm">
                            {p.score}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: Stats & Mini Join Code */}
                  <div className="md:col-span-4 flex flex-col justify-center space-y-3">
                    <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                      <div className="text-[11px] font-bold uppercase text-white/60">Crowd Players</div>
                      <div className="text-3xl font-black text-white">{players.length}</div>
                    </div>

                    <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                      <div className="text-[11px] font-bold uppercase text-white/60">Total Points Scored</div>
                      <div className="text-3xl font-black text-yellow-300 font-mono">
                        {crowdScoreTotal.toLocaleString()}
                      </div>
                    </div>

                    {/* Mini QR */}
                    <div className="bg-white/5 border border-white/15 rounded-2xl p-3 flex items-center gap-3">
                      <div className="w-14 h-14 bg-white rounded-lg p-1 flex-shrink-0">
                        <div
                          className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{ __html: initialQrSvg }}
                        />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-white">Joined late?</div>
                        <div className="text-[10px] text-white/60">Scan to enter the next round</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STATE 4: RESULTS (3D PODIUM CELEBRATION) */}
            {state === "results" && (
              <div className="w-full h-full flex flex-col justify-between items-center text-center">
                <div>
                  <div className="text-xs uppercase font-extrabold text-yellow-300 tracking-wider">
                    Round {roundIndex + 1} Ceremony
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-white">
                    Podium Celebration
                  </h2>
                </div>

                {/* 3D Risers */}
                <div className="flex items-end justify-center gap-4 md:gap-8 w-full max-w-2xl my-auto">
                  {/* 2nd Place (Left) */}
                  {secondPlace && (
                    <div className="flex flex-col items-center w-36 md:w-44 animate-in slide-in-from-bottom-8 duration-500 delay-150">
                      <div
                        className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border-3 border-ink overflow-hidden bg-ink shadow-lg"
                        dangerouslySetInnerHTML={{ __html: avatar(secondPlace.avatarIndex, 70) }}
                      />
                      <div className="font-black text-sm md:text-base text-white mt-2 truncate w-full">
                        {secondPlace.name}
                      </div>
                      <div className="font-extrabold text-xs text-white/70 font-mono mb-2">
                        {secondPlace.score} pts
                      </div>
                      <div
                        className="w-full rounded-t-2xl border-4 border-b-0 border-ink flex flex-col items-center justify-start pt-3 font-black text-5xl md:text-6xl text-ink shadow-md"
                        style={{ height: "160px", backgroundColor: "#3FC8FF" }}
                      >
                        2
                        <span className="text-xs font-black uppercase text-ink/80 tracking-wider mt-1">
                          Silver
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 1st Place (Center - Highest) */}
                  {firstPlace && (
                    <div className="flex flex-col items-center w-44 md:w-52 animate-in slide-in-from-bottom-12 duration-700">
                      <span className="text-3xl mb-1">👑</span>
                      <div
                        className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border-4 border-ink overflow-hidden bg-ink shadow-2xl ring-4 ring-yellow-300"
                        dangerouslySetInnerHTML={{ __html: avatar(firstPlace.avatarIndex, 80) }}
                      />
                      <div className="font-black text-base md:text-lg text-yellow-300 mt-2 truncate w-full">
                        {firstPlace.name}
                      </div>
                      <div className="font-extrabold text-sm text-white font-mono mb-2">
                        {firstPlace.score} pts
                      </div>
                      <div
                        className="w-full rounded-t-2xl border-4 border-b-0 border-ink flex flex-col items-center justify-start pt-3 font-black text-6xl md:text-7xl text-ink shadow-xl"
                        style={{ height: "220px", backgroundColor: "#FFDD3C" }}
                      >
                        1
                        <span className="text-xs font-black uppercase text-ink/80 tracking-wider mt-1">
                          Champion
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 3rd Place (Right) */}
                  {thirdPlace && (
                    <div className="flex flex-col items-center w-36 md:w-44 animate-in slide-in-from-bottom-6 duration-500 delay-300">
                      <div
                        className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border-3 border-ink overflow-hidden bg-ink shadow-lg"
                        dangerouslySetInnerHTML={{ __html: avatar(thirdPlace.avatarIndex, 70) }}
                      />
                      <div className="font-black text-sm md:text-base text-white mt-2 truncate w-full">
                        {thirdPlace.name}
                      </div>
                      <div className="font-extrabold text-xs text-white/70 font-mono mb-2">
                        {thirdPlace.score} pts
                      </div>
                      <div
                        className="w-full rounded-t-2xl border-4 border-b-0 border-ink flex flex-col items-center justify-start pt-3 font-black text-5xl md:text-6xl text-ink shadow-md"
                        style={{ height: "120px", backgroundColor: "#FF7A1A" }}
                      >
                        3
                        <span className="text-xs font-black uppercase text-ink/80 tracking-wider mt-1">
                          Bronze
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm font-bold text-white/70 bg-white/5 border border-white/10 rounded-full px-5 py-2">
                  ✨ Every player&apos;s points are saved to their OnePass ID in real-time.
                </div>
              </div>
            )}

            {/* STATE 5: RECAP */}
            {state === "recap" && (
              <div className="w-full h-full flex flex-col justify-center items-center text-center space-y-6">
                <div>
                  <span className="text-xs font-black uppercase px-3 py-1 rounded-md bg-yellow-400 text-ink">
                    ACTIVATION SUMMARY
                  </span>
                  <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mt-2">
                    That&apos;s a wrap tonight!
                  </h2>
                  <p className="text-sm text-white/70 mt-1">
                    {currentEvent.title} • {currentEvent.venueName}
                  </p>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-3xl text-left">
                  <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white/60 uppercase">Players Joined</div>
                    <div className="text-3xl md:text-4xl font-black text-white mt-1">
                      {players.length}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                      100% verified footfall
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white/60 uppercase">OnePass IDs Linked</div>
                    <div className="text-3xl md:text-4xl font-black text-yellow-300 mt-1">
                      {Math.round(players.length * 0.76)}
                    </div>
                    <div className="text-[11px] text-white/60 mt-1">76% of venue crowd</div>
                  </div>

                  <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white/60 uppercase">Points Issued</div>
                    <div className="text-3xl md:text-4xl font-black text-emerald-400 font-mono mt-1">
                      {(crowdScoreTotal * 1.5).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-white/60 mt-1">Sponsor pool funded</div>
                  </div>

                  <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white/60 uppercase">Branded Play Time</div>
                    <div className="text-3xl md:text-4xl font-black text-white mt-1">
                      {Math.round((players.length * 30 * 2) / 60)} mins
                    </div>
                    <div className="text-[11px] text-white/60 mt-1">Active engagement</div>
                  </div>

                  <div className="bg-white/5 border border-white/15 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white/60 uppercase">7-Day Return Target</div>
                    <div className="text-3xl md:text-4xl font-black text-purple-400 mt-1">28%+</div>
                    <div className="text-[11px] text-white/60 mt-1">Voucher redemption</div>
                  </div>

                  <div className="bg-yellow-400 text-ink border-2 border-ink rounded-2xl p-4 shadow-[0_4px_0_#18123F]">
                    <div className="text-xs font-black uppercase text-ink/80">
                      App Retention Seed
                    </div>
                    <div className="text-3xl md:text-4xl font-black text-ink mt-1">
                      {Math.round(players.length * 0.76)}
                    </div>
                    <div className="text-[11px] font-bold text-ink/80 mt-1">
                      Players with saved progress
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Floating Fullscreen Exit Button */}
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-6 right-6 z-50 bg-black/60 hover:bg-black/90 text-white font-extrabold text-xs px-4 py-2 rounded-xl border border-white/30 backdrop-blur"
            >
              ✕ Exit Fullscreen (Esc)
            </button>
          )}
        </div>

        {/* Companion Phone Preview (Toggleable) */}
        {showCompanion && !isFullscreen && (
          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="text-xs font-black uppercase tracking-wider text-white/60 mb-2 flex items-center gap-1.5">
              <span>📱 Live Companion Phone</span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-emerald-400 font-mono">
                SYNCED
              </span>
            </div>
            {/* Phone Bezel */}
            <div className="w-[320px] h-[640px] rounded-[42px] p-2.5 bg-[#18123F] border-4 border-ink shadow-[0_16px_36px_rgba(0,0,0,0.8),0_0_0_2px_#3FC8FF] relative overflow-hidden">
              {/* Phone screen content */}
              <div className="w-full h-full rounded-[34px] overflow-y-auto overflow-x-hidden relative bg-[#0B0820]">
                <EventMobileClient
                  initialPlayer={{
                    profileId: initialHostPlayer.profileId,
                    name: initialHostPlayer.name,
                    avatarIndex: initialHostPlayer.avatarIndex,
                    onePassId: initialHostPlayer.onePassId,
                    pointsBalance: initialHostPlayer.pointsBalance,
                    isGuest: initialHostPlayer.isGuest,
                  }}
                  event={currentEvent}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Host Controller Docked Panel */}
      <div className="w-full max-w-7xl mt-6 bg-white/5 border border-white/15 rounded-3xl p-5 backdrop-blur-lg flex flex-wrap items-center justify-between gap-4">
        {/* State Machine Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {state === "idle" && (
            <button
              onClick={handleOpenLobby}
              className="px-6 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-ink font-black text-base shadow-[0_4px_0_#18123F] active:translate-y-0.5 transition-all"
            >
              📢 Open Lobby
            </button>
          )}

          {state === "lobby" && (
            <button
              onClick={handleStartRound}
              className="px-6 py-3 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-ink font-black text-base shadow-[0_4px_0_#18123F] active:translate-y-0.5 transition-all"
            >
              ⚡ Start Round {roundIndex + 1}
            </button>
          )}

          {state === "round" && (
            <button
              onClick={handleRoundEnd}
              className="px-6 py-3 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-black text-base shadow-[0_4px_0_#18123F] active:translate-y-0.5 transition-all"
            >
              ⏹ Force Finish Round
            </button>
          )}

          {state === "results" && (
            <button
              onClick={handleAdvanceToNextOrRecap}
              className="px-6 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-ink font-black text-base shadow-[0_4px_0_#18123F] active:translate-y-0.5 transition-all"
            >
              {roundIndex + 1 < currentEvent.rounds.length
                ? `▶ Start Round ${roundIndex + 2}`
                : "🏆 Final Wrap-Up & Recap"}
            </button>
          )}

          {state === "recap" && (
            <button
              onClick={handleReset}
              className="px-6 py-3 rounded-2xl bg-white hover:bg-white/90 text-ink font-black text-base shadow-[0_4px_0_#18123F] active:translate-y-0.5 transition-all"
            >
              🔄 Run Event Again
            </button>
          )}

          {/* Crowd Simulation Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/15">
            <button
              onClick={() => addCrowdPlayers(5)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
            >
              +5 Joins
            </button>
            <button
              onClick={() => addCrowdPlayers(20)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
            >
              +20 Joins
            </button>
            <button
              onClick={() => setAutoSimulate((s) => !s)}
              className={`px-3 py-2 rounded-xl font-bold text-xs border transition-colors ${
                autoSimulate
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                  : "bg-white/5 border-white/15 text-white/50"
              }`}
            >
              Auto-Join: {autoSimulate ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-4 text-xs font-bold text-white/70">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                state === "round"
                  ? "bg-red-500 animate-pulse"
                  : state === "lobby"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-yellow-400"
              }`}
            />
            <span className="capitalize">{state} stage</span>
          </div>

          <div className="text-white/40 hidden md:block">•</div>

          <div className="hidden md:flex items-center gap-1 text-white/50">
            <span>Shortcut:</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">
              Space
            </kbd>
            <span>advance</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px] ml-2">
              F
            </kbd>
            <span>fullscreen</span>
          </div>
        </div>
      </div>
    </div>
  );
}

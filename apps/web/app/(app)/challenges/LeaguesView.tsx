"use client";

import { useState } from "react";
import { avatar, icon, type IconName } from "@playloop/ui";
import {
  type Season,
  type PassProgress,
  seasonDaysRemaining,
} from "@playloop/economy";
import { type LeagueItem, type LeaderboardEntry } from "@/lib/leagues";
import { createLeagueAction, joinLeagueAction } from "./leagueActions";
import { Spinner } from "@/app/_components/Spinner";

export function LeaguesView({
  season,
  passProgress,
  joinedLeagues,
  openLeagues,
  leaderboardsByLeagueId,
}: {
  season: Season;
  passProgress: PassProgress;
  joinedLeagues: LeagueItem[];
  openLeagues: LeagueItem[];
  leaderboardsByLeagueId: Record<string, LeaderboardEntry[]>;
}) {
  const [openLeagueId, setOpenLeagueId] = useState<string | null>(
    joinedLeagues[0]?.id ?? null,
  );
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Join form state
  const [joinCode, setJoinCode] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState("school");
  const [createName, setCreateName] = useState("");
  const [createTeam, setCreateTeam] = useState("");
  const [createCode, setCreateCode] = useState("");

  const daysLeft = seasonDaysRemaining(season);

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      // Fallback
    }
  }

  async function handleJoinSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinPending(true);
    setJoinError(null);

    const formData = new FormData();
    formData.set("code", joinCode.trim().toUpperCase());

    const res = await joinLeagueAction(formData);
    setJoinPending(false);
    if (!res.ok) {
      setJoinError(res.error ?? "Failed to join league");
    } else {
      setJoinCode("");
    }
  }

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError("Enter a league name");
      return;
    }
    setCreatePending(true);
    setCreateError(null);

    const formData = new FormData();
    formData.set("name", createName.trim());
    formData.set("kind", createKind);
    if (createTeam.trim()) formData.set("teamName", createTeam.trim());
    if (createCode.trim()) formData.set("code", createCode.trim().toUpperCase());

    const res = await createLeagueAction(formData);
    setCreatePending(false);
    if (!res.ok) {
      setCreateError(res.error ?? "Failed to create league");
    } else {
      setShowCreateModal(false);
      setCreateName("");
      setCreateTeam("");
      setCreateCode("");
    }
  }

  return (
    <div className="fade-in mt-4 flex flex-col gap-6">
      {/* 1. National Season & Season Pass Spotlight Card */}
      <div className="card-hard overflow-hidden rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]"
            style={{ background: season.color }}
          >
            {season.tag}
          </span>
          <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-extrabold text-soft [border:1.5px_solid_var(--ink)]">
            ⏳ {daysLeft} days left
          </span>
        </div>

        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{season.name}</h2>
        <p className="mt-1 text-xs font-semibold text-soft">{season.description}</p>

        {/* Season Pass Progress Bar */}
        <div className="mt-4 rounded-2xl bg-card p-3 [border:var(--border-thick)]">
          <div className="flex items-center justify-between text-xs font-extrabold">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-lemon text-xs [border:1.5px_solid_var(--ink)]"
                dangerouslySetInnerHTML={{ __html: icon("trophy") }}
              />
              Season Pass: {passProgress.tierName}
            </span>
            <span>
              {passProgress.nextTier
                ? `${passProgress.pointsToNext} pts to ${passProgress.nextTier.name}`
                : "Max Tier"}
            </span>
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full border border-ink/40 bg-paper">
            <div
              className="h-full bg-lemon transition-all duration-500"
              style={{ width: `${passProgress.percent}%` }}
            />
          </div>

          {passProgress.nextTier && (
            <p className="mt-2 text-[11px] font-bold text-soft">
              🎁 Next unlock:{" "}
              <span className="font-extrabold text-ink">
                {passProgress.nextTier.reward}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* 2. Your Leagues Accordion List */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">
            Your Leagues ({joinedLeagues.length})
          </h3>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn sm"
          >
            + New League
          </button>
        </div>

        {joinedLeagues.length === 0 ? (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-ink/30 p-6 text-center text-sm font-semibold text-soft">
            You haven&apos;t joined any leagues yet. Enter a code below or join an open league to compete as a team!
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {joinedLeagues.map((l) => {
              const isOpen = openLeagueId === l.id;
              const leaderboard = leaderboardsByLeagueId[l.id] ?? [];

              return (
                <div
                  key={l.id}
                  className="card-hard overflow-hidden rounded-2xl bg-card [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
                >
                  {/* League Card Header */}
                  <button
                    type="button"
                    onClick={() => setOpenLeagueId(isOpen ? null : l.id)}
                    className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-paper/50"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg text-ink [border:2px_solid_var(--ink)]"
                        style={{ background: l.color }}
                        dangerouslySetInnerHTML={{
                          __html: icon((l.icon as IconName) || "trophy"),
                        }}
                      />
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-soft">
                          {l.kind} league
                        </span>
                        <h4 className="font-extrabold leading-tight text-ink">
                          {l.name}
                        </h4>
                        <span className="text-xs font-bold text-soft">
                          {l.teamName ? `${l.teamName} · ` : ""}
                          {l.memberCount} members
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-lemon px-2.5 py-1 text-xs font-black text-ink [border:1.5px_solid_var(--ink)]">
                        #{l.userRank}
                      </span>
                      <span className="text-xs font-bold text-soft">
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {/* Expandable Leaderboard */}
                  {isOpen && (
                    <div className="border-t-2 border-ink/10 bg-paper/30 p-3">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-extrabold text-soft">
                          Team Leaderboard
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(l.code)}
                          className="flex items-center gap-1 rounded-md bg-card px-2 py-0.5 text-[11px] font-extrabold text-ink [border:1px_solid_var(--ink)] hover:bg-lemon"
                        >
                          {copiedCode === l.code ? "✓ Copied!" : `Code: ${l.code}`}
                        </button>
                      </div>

                      <div className="overflow-hidden rounded-xl bg-card [border:var(--border-thick)]">
                        {leaderboard.length === 0 ? (
                          <p className="p-3 text-center text-xs font-bold text-soft">
                            No member scores recorded yet.
                          </p>
                        ) : (
                          leaderboard.map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex items-center gap-2.5 border-b-2 border-ink/10 p-2.5 text-xs font-semibold last:border-b-0 ${
                                entry.isMe ? "bg-lemon/20" : ""
                              }`}
                            >
                              <span className="w-5 text-center font-black text-soft">
                                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                              </span>
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: avatar(entry.avatarIndex, 24),
                                }}
                              />
                              <div className="flex-1 truncate">
                                <span className="font-extrabold text-ink">
                                  {entry.name}
                                  {entry.isMe && " (you)"}
                                </span>
                                {entry.teamName && (
                                  <span className="ml-1 text-[10px] text-soft">
                                    · {entry.teamName}
                                  </span>
                                )}
                              </div>
                              <span className="font-black text-ink">
                                {entry.score.toLocaleString("en-US")} pts
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Join a League with Code */}
      <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <h3 className="text-sm font-extrabold text-ink">Join a League</h3>
        <p className="mt-0.5 text-xs font-semibold text-soft">
          Have a code from your school, company, or family organizer?
        </p>

        {joinError && (
          <p className="mt-2 text-xs font-bold text-gum">{joinError}</p>
        )}

        <form onSubmit={handleJoinSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="e.g. HORIZON-8B"
            className="flex-1 rounded-xl bg-paper px-3 py-2 text-sm font-bold uppercase tracking-wider [border:var(--border-thick)]"
            required
          />
          <button
            type="submit"
            disabled={joinPending}
            className="btn go sm"
          >
            {joinPending ? <Spinner size={16} /> : "Join"}
          </button>
        </form>

        {/* Quick Open Leagues Chips */}
        {openLeagues.length > 0 && (
          <div className="mt-4 border-t-2 border-ink/10 pt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-soft">
              Open Community Leagues
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {openLeagues.map((ol) => (
                <button
                  key={ol.id}
                  type="button"
                  onClick={() => setJoinCode(ol.code)}
                  className="flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)] hover:bg-lemon"
                >
                  <span
                    className="inline-block h-3.5 w-3.5"
                    dangerouslySetInnerHTML={{
                      __html: icon((ol.icon as IconName) || "trophy"),
                    }}
                  />
                  <span>{ol.name}</span>
                  <span className="text-soft">({ol.code})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Create League Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div className="card-hard w-full max-w-sm rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold tracking-tight">
                Create a League
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
                aria-label="Close"
              >
                <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
              </button>
            </div>

            <p className="mt-1 text-xs font-semibold text-soft">
              Start a competition for your school class, office squad, mall crew, or family.
            </p>

            {createError && (
              <p className="mt-2 text-xs font-bold text-gum">{createError}</p>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-extrabold text-soft">League Type</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[
                    { id: "school", label: "🏫 School", color: "#3FC8FF" },
                    { id: "company", label: "🏢 Company", color: "#22D39B" },
                    { id: "family", label: "👨‍👩‍👧‍👦 Family", color: "#FF5FA2" },
                    { id: "mall", label: "🛍️ Mall", color: "#FFDD3C" },
                  ].map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setCreateKind(k.id)}
                      className={`rounded-xl p-2 text-xs font-extrabold text-ink transition-all [border:2px_solid_var(--ink)] ${
                        createKind === k.id
                          ? "scale-[1.02] shadow-[2px_2px_0_var(--ink)]"
                          : "opacity-60 bg-card"
                      }`}
                      style={{ background: createKind === k.id ? k.color : undefined }}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-soft">League Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Grade 9 Champions, Dubai Tech Hub"
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-soft">Your Team / Department</label>
                <input
                  type="text"
                  value={createTeam}
                  onChange={(e) => setCreateTeam(e.target.value)}
                  placeholder="e.g. Design Team, Section B, The Novas"
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-soft">Custom Join Code (Optional)</label>
                <input
                  type="text"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DUBAI-2026 (leave empty to auto-generate)"
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold uppercase [border:var(--border-thick)]"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPending}
                  className="btn go flex-1"
                >
                  {createPending ? <Spinner size={16} /> : "Create & Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { avatar, icon, type IconName } from "@playloop/ui";
import {
  type Season,
  type PassProgress,
  seasonDaysRemaining,
} from "@playloop/economy";
import { type LeagueItem, type LeaderboardEntry } from "@/lib/leagues";
import { createLeagueAction, joinLeagueAction } from "./leagueActions";
import { Spinner } from "@/app/_components/Spinner";
import { SuccessModal } from "@/app/_components/SuccessModal";

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

  // Celebratory modals
  const [createdLeagueModal, setCreatedLeagueModal] = useState<any | null>(null);
  const [createdQrDataUrl, setCreatedQrDataUrl] = useState<string>("");
  const [joinedLeagueModal, setJoinedLeagueModal] = useState<any | null>(null);
  const [seasonPassModal, setSeasonPassModal] = useState(false);

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
      if (res.league) {
        setJoinedLeagueModal(res.league);
      }
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
      const leaguePayload = res.league ?? {
        name: createName.trim(),
        code: createCode.trim().toUpperCase() || "LEAGUE",
        kind: createKind,
      };
      setCreatedLeagueModal(leaguePayload);
      try {
        const qrUrl = typeof window !== "undefined"
          ? `${window.location.origin}/challenges?join=${encodeURIComponent(leaguePayload.code)}`
          : leaguePayload.code;
        QRCode.toDataURL(qrUrl, { margin: 1, color: { dark: "#111111", light: "#ffffff" } })
          .then(setCreatedQrDataUrl)
          .catch(() => {});
      } catch {
        // ignore
      }
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
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSeasonPassModal(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setSeasonPassModal(true);
          }}
          className="mt-4 rounded-2xl bg-card p-3 [border:var(--border-thick)] cursor-pointer hover:brightness-95 transition-all shadow-hard-sm"
          aria-label="View Season Pass details"
        >
          <div className="flex items-center justify-between text-xs font-extrabold">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-lemon text-xs [border:1.5px_solid_var(--ink)]"
                dangerouslySetInnerHTML={{ __html: icon("trophy") }}
              />
              Season Pass: {passProgress.tierName}
            </span>
            <span className="flex items-center gap-1">
              {passProgress.nextTier ? (
                <>
                  <span className="coin sm" aria-hidden="true" />
                  <span>{passProgress.pointsToNext} pts to {passProgress.nextTier.name}</span>
                </>
              ) : (
                "Max Tier"
              )}
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
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg text-ink [border:2px_solid_var(--ink)]"
                        style={{ background: l.color }}
                        dangerouslySetInnerHTML={{
                          __html: icon((l.icon as IconName) || "trophy"),
                        }}
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-soft">
                          {l.kind} league
                        </span>
                        <h4 className="truncate font-extrabold leading-tight text-ink">
                          {l.name}
                        </h4>
                        <span className="text-xs font-bold text-soft">
                          {l.teamName ? `${l.teamName} · ` : ""}
                          {l.memberCount} members
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
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
                              <span className="flex shrink-0 items-center gap-1 font-black text-ink">
                                <span className="coin sm" aria-hidden="true" />
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

      {/* Celebratory Modal: League Created & Join PIN */}
      {createdLeagueModal && (
        <SuccessModal
          isOpen={Boolean(createdLeagueModal)}
          onClose={() => setCreatedLeagueModal(null)}
          title="🏆 League Created Successfully!"
          badgeText={createdLeagueModal.kind ? `${createdLeagueModal.kind} League` : "Custom League"}
          iconHtml={icon("trophy")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Share on WhatsApp",
            onClick: () => {
              const pin = createdLeagueModal.code;
              const name = createdLeagueModal.name;
              const origin = typeof window !== "undefined" ? window.location.origin : "https://playloop.ae";
              const text = `Join my PlayLoop League "${name}"! Use Join PIN: ${pin} or visit ${origin}/challenges`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            },
          }}
          secondaryAction={{
            label: "Go to League Board",
            onClick: () => {
              const id = createdLeagueModal.id;
              setCreatedLeagueModal(null);
              if (id) setOpenLeagueId(id);
            },
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm text-left">
              <span className="text-[10px] font-black uppercase tracking-wider text-soft">League Name</span>
              <h3 className="text-lg font-black text-ink">{createdLeagueModal.name}</h3>
            </div>
            <p className="text-sm font-bold text-soft">
              Your custom league is live! Share your Join PIN with your team or classmates:
            </p>
            <div className="flex w-full items-center justify-between gap-2 rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <div className="text-left">
                <span className="text-[10px] font-black uppercase tracking-wider text-soft">Join PIN</span>
                <p className="font-mono text-xl font-black tracking-widest text-ink">{createdLeagueModal.code}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(createdLeagueModal.code)}
                className="btn sm"
              >
                {copiedCode === createdLeagueModal.code ? "Copied!" : "Copy PIN"}
              </button>
            </div>
            {createdQrDataUrl ? (
              <div className="rounded-2xl border-2 border-ink bg-white p-2 shadow-hard-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={createdQrDataUrl} alt="League QR code" className="h-32 w-32" />
              </div>
            ) : null}
          </div>
        </SuccessModal>
      )}

      {/* Celebratory Modal: League Joined */}
      {joinedLeagueModal && (
        <SuccessModal
          isOpen={Boolean(joinedLeagueModal)}
          onClose={() => setJoinedLeagueModal(null)}
          title={`Welcome to ${joinedLeagueModal.name}!`}
          badgeText="League Joined"
          iconHtml={icon("check")}
          accentColor="mint"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "View League Leaderboard",
            onClick: () => {
              const id = joinedLeagueModal.id;
              setJoinedLeagueModal(null);
              if (id) setOpenLeagueId(id);
            },
          }}
          secondaryAction={{
            label: "Dismiss",
            onClick: () => setJoinedLeagueModal(null),
          }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">
              You are now enrolled in <span className="font-bold text-ink">{joinedLeagueModal.name}</span>.
            </p>
            <p className="text-xs text-soft">
              Play any game to contribute points to your team and climb the leaderboard!
            </p>
          </div>
        </SuccessModal>
      )}

      {/* Season Pass Tier Modal */}
      {seasonPassModal && (
        <SuccessModal
          isOpen={seasonPassModal}
          onClose={() => setSeasonPassModal(false)}
          title={`🏅 Season Tier: ${passProgress.tierName}`}
          badgeText={season.tag}
          iconHtml={icon("trophy")}
          accentColor="lemon"
          confetti={false}
          soundEffect="tap"
          primaryAction={{
            label: "Keep Playing to Unlock",
            onClick: () => setSeasonPassModal(false),
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <div className="flex justify-between items-center text-xs font-bold text-soft mb-1">
                <span>Current Tier</span>
                <span className="font-extrabold text-ink">{passProgress.tierName}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-ink/40 bg-card">
                <div className="h-full bg-lemon" style={{ width: `${passProgress.percent}%` }} />
              </div>
              <p className="mt-2 text-xs font-bold text-soft">
                {passProgress.nextTier
                  ? `${passProgress.pointsToNext.toLocaleString("en-US")} points needed for ${passProgress.nextTier.name}`
                  : "Maximum season tier achieved!"}
              </p>
            </div>
            {passProgress.nextTier && (
              <div className="rounded-2xl bg-mint/20 p-3 border-2 border-ink text-xs font-semibold">
                🎁 <span className="font-bold">Next Unlock:</span> {passProgress.nextTier.reward}
              </div>
            )}
          </div>
        </SuccessModal>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { avatar, icon } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { type Season, type PassProgress } from "@playloop/economy";
import { type LeagueItem, type LeaderboardEntry } from "@/lib/leagues";
import { LeaguesView } from "./LeaguesView";

interface SentChallenge {
  code: string;
  senderScore: number;
  createdAt: Date;
  gameTitle: string;
}

interface CompletedChallenge {
  senderId: string;
  recipientId: string | null;
  winnerId: string | null;
  senderScore: number;
  gameTitle: string;
  completedAt: Date | null;
}

interface Opponent {
  id: string;
  name: string | null;
  avatarIndex: number;
}

interface FriendLeaderboardEntry {
  profileId: string;
  weeklyPoints: number;
}

interface FriendInfo {
  id: string;
  name: string | null;
  avatarIndex: number;
}

export function CompeteTabs({
  profile,
  season,
  passProgress,
  joinedLeagues,
  openLeagues,
  leaderboardsByLeagueId,
  sent,
  history,
  friends,
  weeklyBoard,
  opponents,
}: {
  profile: { id: string; name: string | null; avatarIndex: number };
  season: Season;
  passProgress: PassProgress;
  joinedLeagues: LeagueItem[];
  openLeagues: LeagueItem[];
  leaderboardsByLeagueId: Record<string, LeaderboardEntry[]>;
  sent: SentChallenge[];
  history: CompletedChallenge[];
  friends: FriendInfo[];
  weeklyBoard: FriendLeaderboardEntry[];
  opponents: Opponent[];
}) {
  const [activeTab, setActiveTab] = useState<"leagues" | "challenges">("leagues");
  const [showBragModal, setShowBragModal] = useState(false);

  const opponentById = new Map(opponents.map((o) => [o.id, o]));
  const friendById = new Map(friends.map((f) => [f.id, f]));
  const isFirstPlace = weeklyBoard.length > 0 && weeklyBoard[0]?.profileId === profile.id;
  const runnerUp = weeklyBoard[1] ? friendById.get(weeklyBoard[1].profileId) : null;
  const delta = weeklyBoard[1] ? weeklyBoard[0]!.weeklyPoints - weeklyBoard[1].weeklyPoints : 0;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Compete</h1>

      {/* Segmented Tab Control */}
      <div className="mt-4 flex rounded-2xl bg-card p-1 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <button
          type="button"
          onClick={() => setActiveTab("leagues")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-all ${
            activeTab === "leagues"
              ? "bg-lemon text-ink [border:1.5px_solid_var(--ink)] shadow-[1px_1px_0_var(--ink)]"
              : "text-soft hover:text-ink"
          }`}
        >
          <span>🏆 Leagues</span>
          <span className="rounded-full bg-ink px-1.5 py-0.2 text-[10px] font-black text-white">
            {joinedLeagues.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("challenges")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-all ${
            activeTab === "challenges"
              ? "bg-lemon text-ink [border:1.5px_solid_var(--ink)] shadow-[1px_1px_0_var(--ink)]"
              : "text-soft hover:text-ink"
          }`}
        >
          <span>⚔️ Challenges</span>
          {sent.length > 0 && (
            <span className="rounded-full bg-gum px-1.5 py-0.2 text-[10px] font-black text-white">
              {sent.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Leagues & National Season */}
      {activeTab === "leagues" ? (
        <LeaguesView
          season={season}
          passProgress={passProgress}
          joinedLeagues={joinedLeagues}
          openLeagues={openLeagues}
          leaderboardsByLeagueId={leaderboardsByLeagueId}
        />
      ) : (
        /* Tab 2: 1-on-1 Challenges & Weekly Friends */
        <div className="fade-in mt-6 flex flex-col gap-6">
          {/* Weekly friends leaderboard */}
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-soft">This week among friends</h2>
              {isFirstPlace && (
                <button
                  type="button"
                  onClick={() => setShowBragModal(true)}
                  className="rounded-full bg-lemon px-2.5 py-0.5 text-xs font-black text-ink border-2 border-ink shadow-hard-sm hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span dangerouslySetInnerHTML={{ __html: icon("crown") }} />
                  Brag #1
                </button>
              )}
            </div>
            {weeklyBoard.length === 0 ? (
              <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
                {friends.length === 0
                  ? "Play a challenge to make your first friend."
                  : "No points earned this week yet. Play a game to start."}
              </p>
            ) : (
              <div className="fade-in mt-2 overflow-hidden rounded-2xl bg-card [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
                {weeklyBoard.map((entry, i) => {
                  const friend = friendById.get(entry.profileId);
                  const isMe = entry.profileId === profile.id;
                  return (
                    <div
                      key={entry.profileId}
                      className={`flex items-center gap-3 border-b-2 border-ink/10 p-3 text-sm font-semibold last:border-b-0 ${
                        isMe ? "bg-lemon/20" : ""
                      }`}
                    >
                      <span className="w-5 text-center text-xs font-extrabold text-soft">{i + 1}</span>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: avatar(isMe ? profile.avatarIndex : friend?.avatarIndex ?? 0, 30),
                        }}
                      />
                      <span className="flex-1 min-w-0 truncate font-bold">
                        {isMe ? `${profile.name ?? "You"} (you)` : friend?.name ?? "Player"}
                      </span>
                      <b className="flex shrink-0 items-center gap-1 font-extrabold text-ink">
                        <span className="coin sm" aria-hidden="true" />
                        {entry.weeklyPoints.toLocaleString("en-US")} pts
                      </b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sent challenges waiting for opponent */}
          <div>
            <h2 className="text-sm font-extrabold text-soft">Awaiting reply</h2>
            {sent.length === 0 ? (
              <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
                No active challenges sent. Share one from any game result!
              </p>
            ) : (
              <div className="fade-in mt-2 flex flex-col gap-2">
                {sent.map((c) => (
                  <div
                    key={c.code}
                    className="flex items-center justify-between rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-extrabold">{c.gameTitle}</p>
                      <p className="text-xs font-bold text-soft">
                        Score to beat: {c.senderScore.toLocaleString("en-US")}
                      </p>
                    </div>
                    <span className="rounded-lg border-2 border-ink bg-paper px-2 py-1 text-xs font-extrabold">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed challenge history */}
          <div>
            <h2 className="text-sm font-extrabold text-soft">History</h2>
            {history.length === 0 ? (
              <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
                No finished challenges yet.
              </p>
            ) : (
              <div className="fade-in mt-2 flex flex-col gap-2">
                {history.map((h, idx) => {
                  const opponentId = h.senderId === profile.id ? h.recipientId : h.senderId;
                  const opponent = opponentId ? opponentById.get(opponentId) : null;
                  const won = h.winnerId === profile.id;
                  const lost = h.winnerId && h.winnerId !== profile.id;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          dangerouslySetInnerHTML={{
                            __html: avatar(opponent?.avatarIndex ?? 0, 32),
                          }}
                        />
                        <div>
                          <p className="font-extrabold leading-tight">
                            {opponent?.name ?? "Player"}
                          </p>
                          <p className="text-xs font-bold text-soft">{h.gameTitle}</p>
                        </div>
                      </div>
                      <span
                        className={`rounded-lg border-2 border-ink px-2.5 py-1 text-xs font-extrabold ${
                          won ? "bg-mint text-ink" : lost ? "bg-gum text-white" : "bg-card"
                        }`}
                      >
                        {won ? "Won" : lost ? "Lost" : "Tie"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showBragModal && isFirstPlace && (
        <SuccessModal
          isOpen={showBragModal}
          onClose={() => setShowBragModal(false)}
          title="👑 YOU'RE #1 AMONG FRIENDS!"
          badgeText="Weekly Leaderboard #1"
          iconHtml={icon("crown")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Brag to Friends on WhatsApp",
            onClick: () => {
              const pts = weeklyBoard[0]!.weeklyPoints.toLocaleString("en-US");
              const origin = typeof window !== "undefined" ? window.location.origin : "https://playloop.ae";
              const text = `I'm currently RANK #1 with ${pts} points on the PlayLoop weekly friends leaderboard! Think you can knock me off? ${origin}/challenges`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            },
          }}
          secondaryAction={{
            label: "Dismiss",
            onClick: () => setShowBragModal(false),
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-full rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
              <span className="text-xs font-bold text-soft uppercase tracking-wider">Weekly Score</span>
              <div className="my-1 flex items-center justify-center gap-2 text-4xl font-black text-ink">
                <span className="coin md" aria-hidden="true" />
                <span>{weeklyBoard[0]!.weeklyPoints.toLocaleString("en-US")} pts</span>
              </div>
              {runnerUp ? (
                <p className="flex items-center justify-center gap-1 text-xs font-bold text-mint-foreground">
                  <span className="coin sm" aria-hidden="true" />
                  <span>+{delta.toLocaleString("en-US")} pts ahead of {runnerUp.name ?? "2nd place"}</span>
                </p>
              ) : (
                <p className="text-xs font-bold text-soft">Holding solo 1st place this week!</p>
              )}
            </div>
            <p className="text-xs font-semibold text-soft">
              You are holding the crown among your squad. Send a brag link to keep the rivalry active!
            </p>
          </div>
        </SuccessModal>
      )}
    </main>
  );
}

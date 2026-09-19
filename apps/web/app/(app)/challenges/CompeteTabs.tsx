"use client";

import { useState } from "react";
import { avatar } from "@playloop/ui";
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

  const opponentById = new Map(opponents.map((o) => [o.id, o]));
  const friendById = new Map(friends.map((f) => [f.id, f]));

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
            <h2 className="text-sm font-extrabold text-soft">This week among friends</h2>
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
                      <span className="flex-1 font-bold">
                        {isMe ? `${profile.name ?? "You"} (you)` : friend?.name ?? "Player"}
                      </span>
                      <b>{entry.weeklyPoints.toLocaleString("en-US")}</b>
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
                    <div>
                      <p className="font-extrabold">{c.gameTitle}</p>
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
    </main>
  );
}

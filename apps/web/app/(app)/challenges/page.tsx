import { avatar } from "@playloop/ui";
import { getDb, schema } from "@playloop/db";
import { and, desc, eq, or } from "drizzle-orm";
import { requireProfile } from "@/lib/profile";
import { getFriends, getWeeklyLeaderboard } from "@/lib/friends";

/**
 * No "Incoming" queue here, on purpose: a challenge has no recipient until
 * someone actually completes a play through its link (see the challenges
 * table's doc comment in packages/db/src/schema.ts) — opening the link and
 * playing happen in one flow, so there's no addressed-but-not-yet-played
 * state to show. Just Sent (awaiting a reply) and History (completed).
 */
export default async function ChallengesPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const [sent, history, friends, weeklyBoard] = await Promise.all([
    db
      .select({
        code: schema.challenges.code,
        senderScore: schema.challenges.senderScore,
        createdAt: schema.challenges.createdAt,
        gameTitle: schema.games.title,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
      .where(and(eq(schema.challenges.senderId, profile.id), eq(schema.challenges.status, "pending")))
      .orderBy(desc(schema.challenges.createdAt)),
    db
      .select({
        senderId: schema.challenges.senderId,
        recipientId: schema.challenges.recipientId,
        winnerId: schema.challenges.winnerId,
        senderScore: schema.challenges.senderScore,
        gameTitle: schema.games.title,
        completedAt: schema.challenges.completedAt,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
      .where(
        and(
          eq(schema.challenges.status, "completed"),
          or(eq(schema.challenges.senderId, profile.id), eq(schema.challenges.recipientId, profile.id)),
        ),
      )
      .orderBy(desc(schema.challenges.completedAt)),
    getFriends(profile.id),
    getWeeklyLeaderboard(profile.id),
  ]);

  // Fetch names/avatars for every opponent seen in history, in one query.
  const opponentIds = [
    ...new Set(history.map((h) => (h.senderId === profile.id ? h.recipientId : h.senderId)).filter((id): id is string => !!id)),
  ];
  const opponents = opponentIds.length
    ? await db
        .select({ id: schema.profiles.id, name: schema.profiles.name, avatarIndex: schema.profiles.avatarIndex })
        .from(schema.profiles)
        .where(or(...opponentIds.map((id) => eq(schema.profiles.id, id))))
    : [];
  const opponentById = new Map(opponents.map((o) => [o.id, o]));

  // Build a lookup for friends by ID for the leaderboard
  const friendById = new Map(friends.map((f) => [f.id, f]));

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Compete</h1>

      {/* Weekly friends leaderboard — prototype's ranked board */}
      <h2 className="mt-6 text-sm font-extrabold text-soft">This week among friends</h2>
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
                className={`flex items-center gap-3 border-b-2 border-ink/10 p-3 text-sm font-semibold last:border-b-0 ${isMe ? "bg-lemon/20" : ""}`}
              >
                <span className="w-5 text-center text-xs font-extrabold text-soft">{i + 1}</span>
                <span
                  dangerouslySetInnerHTML={{
                    __html: avatar(isMe ? profile.avatarIndex : (friend?.avatarIndex ?? 0), 30),
                  }}
                />
                <span className="flex-1 font-bold">
                  {isMe ? `${profile.name ?? "You"} (you)` : (friend?.name ?? "Player")}
                </span>
                <b>{entry.weeklyPoints.toLocaleString("en-US")}</b>
              </div>
            );
          })}
        </div>
      )}

      {/* Sent challenges */}
      <h2 className="mt-6 text-sm font-extrabold text-soft">Sent, awaiting a reply</h2>
      {sent.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          Finish a game and challenge a friend to send one.
        </p>
      ) : (
        <div className="fade-in mt-2 flex flex-col gap-2">
          {sent.map((c) => (
            <div key={c.code} className="rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
              <b>{c.gameTitle}</b>
              <p className="text-sm font-bold text-soft">Beat {c.senderScore.toLocaleString("en-US")}</p>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <h2 className="mt-6 text-sm font-extrabold text-soft">History</h2>
      {history.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          No challenges played yet.
        </p>
      ) : (
        <div className="fade-in mt-2 flex flex-col gap-2">
          {history.map((h, i) => {
            const opponentId = h.senderId === profile.id ? h.recipientId : h.senderId;
            const opponent = opponentId ? opponentById.get(opponentId) : undefined;
            const myScore = h.senderId === profile.id ? h.senderScore : null;
            const won = h.winnerId === profile.id;
            const tie = h.winnerId === null;
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
                <span dangerouslySetInnerHTML={{ __html: avatar(opponent?.avatarIndex ?? 0, 36) }} />
                <div className="flex-1">
                  <b>
                    {tie ? "Tied with" : won ? "Beat" : "Lost to"} {opponent?.name ?? "a player"}
                  </b>
                  <p className="text-xs font-bold text-soft">{h.gameTitle}</p>
                </div>
                {myScore != null ? <span className="text-sm font-extrabold">{myScore.toLocaleString("en-US")}</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

import { avatar } from "@playloop/ui";
import { getDb, schema } from "@playloop/db";
import { and, desc, eq, or } from "drizzle-orm";
import { requireProfile } from "@/lib/profile";

/**
 * No "Incoming" queue here, on purpose: a challenge has no recipient until
 * someone actually completes a play through its link (see the challenges
 * table's doc comment in packages/db/src/schema.ts) — opening the link and
 * playing happen in one flow, so there's no addressed-but-not-yet-played
 * state to show. Just Sent (awaiting a reply) and History (completed).
 * The leaderboard below is derived from History, not a separate query —
 * there's no dedicated friends table in this phase.
 */
export default async function ChallengesPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const [sent, history] = await Promise.all([
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

  // Leaderboard: derived from the same history rows, grouped by opponent.
  const leaderboard = new Map<string, { name: string; games: number; wins: number }>();
  for (const h of history) {
    const opponentId = h.senderId === profile.id ? h.recipientId : h.senderId;
    if (!opponentId) continue;
    const opponent = opponentById.get(opponentId);
    const entry = leaderboard.get(opponentId) ?? { name: opponent?.name ?? "Player", games: 0, wins: 0 };
    entry.games += 1;
    if (h.winnerId === profile.id) entry.wins += 1;
    leaderboard.set(opponentId, entry);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Challenges</h1>

      <h2 className="mt-6 text-sm font-extrabold text-soft">Sent, awaiting a reply</h2>
      {sent.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          Finish a game and challenge a friend to send one.
        </p>
      ) : (
        <div className="fade-in mt-2 flex flex-col gap-2">
          {sent.map((c) => (
            <div key={c.code} className="card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]">
              <b>{c.gameTitle}</b>
              <p className="text-sm font-bold text-soft">Beat {c.senderScore.toLocaleString("en-US")}</p>
            </div>
          ))}
        </div>
      )}

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
            const myScore = h.senderId === profile.id ? h.senderScore : null; // recipient's own score isn't denormalized here; win/loss label covers it
            const won = h.winnerId === profile.id;
            const tie = h.winnerId === null;
            return (
              <div key={i} className="card-hard flex items-center gap-3 rounded-2xl bg-card p-3 [border:var(--border-thick)]">
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

      <h2 className="mt-6 text-sm font-extrabold text-soft">This week among friends</h2>
      {leaderboard.size === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          Play a challenge to start a rivalry.
        </p>
      ) : (
        <div className="card-hard fade-in mt-2 overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]">
          {[...leaderboard.entries()].map(([id, entry]) => (
            <div key={id} className="flex items-center justify-between border-b-2 border-ink/10 p-3 text-sm font-semibold last:border-b-0">
              <span>{entry.name}</span>
              <b>
                {entry.wins}-{entry.games - entry.wins}
              </b>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

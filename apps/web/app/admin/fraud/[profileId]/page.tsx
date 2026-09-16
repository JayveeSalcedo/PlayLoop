import { getDb, schema } from "@playloop/db";
import { playRules, type PlayableType } from "@playloop/games";
import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { SuspendPanel } from "./SuspendPanel";

const REASON_COPY: Record<string, string> = {
  invalid_score: "Score wasn't a whole, non-negative number",
  too_fast: "Finished sooner than the game can physically be played",
  expired: "Submitted long after the session was issued",
  score_implausible: "Score above what the template can produce",
};

/**
 * Why a code game's replay refused a play. These come from a different system
 * than the reasons above — the server re-ran the recorded inputs rather than
 * checking the score against a template's ceiling — so they read differently.
 */
const VERIFY_COPY: Record<string, string> = {
  score_mismatch: "Replaying the inputs produced a different score than claimed",
  tick_mismatch: "Claimed a game length the recorded inputs don't produce",
  events_after_end: "Inputs recorded after the game had already ended",
  bad_log: "Input log was malformed",
  too_fast: "Log covers more play than the time since the session started",
  too_large: "Input log was over the size limit",
  too_many_ticks: "Log claims a game longer than any allowed",
  invalid_score: "Score wasn't a whole, non-negative number",
  expired: "Submitted long after the session was issued",
  // Our side, not the player's: not a fraud signal.
  timeout: "Replay ran out of time (verifier problem, not evidence of cheating)",
  out_of_memory: "Replay ran out of memory (verifier problem, not evidence of cheating)",
  runtime_mismatch: "This build can't replay the game's runtime version (verifier problem)",
  verifier_error: "The verifier itself failed (not evidence of cheating)",
  runtime_error: "The game threw during replay",
  compile_error: "The game's code didn't compile during replay",
  contract_error: "The game broke the runtime contract during replay",
};

export default async function FraudProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  await requireAdmin();
  const { profileId } = await params;
  const db = getDb();

  const profile = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .then((r) => r[0]);
  if (!profile) notFound();

  const [rejected, referred, vouchers] = await Promise.all([
    db
      .select({
        id: schema.playSessions.id,
        startedAt: schema.playSessions.startedAt,
        score: schema.playSessions.score,
        rejectReason: schema.playSessions.rejectReason,
        verifyReason: schema.playSessions.verifyReason,
        verifiedScore: schema.playSessions.verifiedScore,
        gameTitle: schema.games.title,
        gameType: schema.games.type,
        difficulty: schema.games.difficulty,
        config: schema.games.config,
      })
      .from(schema.playSessions)
      .innerJoin(schema.games, eq(schema.playSessions.gameId, schema.games.id))
      .where(and(eq(schema.playSessions.profileId, profileId), eq(schema.playSessions.status, "rejected")))
      .orderBy(desc(schema.playSessions.startedAt))
      .limit(50),
    db
      .select({ id: schema.profiles.id, name: schema.profiles.name, email: schema.profiles.email })
      .from(schema.profiles)
      .innerJoin(schema.challenges, eq(schema.profiles.referredByChallengeId, schema.challenges.id))
      .where(eq(schema.challenges.senderId, profileId))
      .limit(50),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.vouchers)
      .where(eq(schema.vouchers.profileId, profileId))
      .then((r) => r[0]?.n ?? 0),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/admin/fraud" className="text-sm font-extrabold underline">
        Back
      </Link>

      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{profile.name ?? "(no name)"}</h1>
      <p className="text-sm font-bold text-soft">{profile.email}</p>
      <p className="mt-1 text-sm font-bold text-soft">
        Level {profile.level} · {profile.pointsBalance.toLocaleString("en-US")} pts · {vouchers} vouchers ·
        joined {profile.createdAt.toLocaleDateString("en-GB")}
      </p>

      <SuspendPanel
        profileId={profile.id}
        suspended={profile.suspendedAt != null}
        reason={profile.suspendedReason}
      />

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">Rejected plays ({rejected.length})</h2>
        {rejected.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-soft">None.</p>
        ) : (
          <ul className="fade-in mt-3 flex flex-col gap-2">
            {rejected.map((r) => {
              // A code game (no template type) was refused by replaying it, not by
              // a template ceiling — playRules has nothing to say about it.
              const isCode = r.gameType === null;
              // The ceiling that made this a rejection, recomputed from the same
              // rules the validator used — a bare "score_implausible" doesn't
              // tell a reviewer whether it was 10% over or 10x over.
              const config = (r.config ?? {}) as { questions?: unknown[] };
              const questionCount = r.gameType === "quiz" ? (config.questions?.length ?? 1) : undefined;
              const rules = r.gameType === null ? null : playRules(r.gameType as PlayableType, { difficulty: r.difficulty, questionCount });
              return (
                <li key={r.id} className="card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-extrabold">{r.gameTitle}</p>
                    <p className="shrink-0 text-xs font-bold text-soft">
                      {r.startedAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-gum">
                    {isCode
                      ? (VERIFY_COPY[r.verifyReason ?? ""] ?? r.verifyReason ?? "Rejected by replay")
                      : (REASON_COPY[r.rejectReason ?? ""] ?? r.rejectReason)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-soft">
                    claimed {r.score?.toLocaleString("en-US") ?? "—"} ·{" "}
                    {rules
                      ? `ceiling ${rules.maxScore.toLocaleString("en-US")} · ${r.difficulty}`
                      : `replay scored ${r.verifiedScore?.toLocaleString("en-US") ?? "—"}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">Referred sign-ups ({referred.length})</h2>
        <p className="mt-1 text-xs font-bold text-soft">
          Accounts that joined through this player&apos;s challenge links.
        </p>
        {referred.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-soft">None.</p>
        ) : (
          <ul className="fade-in mt-3 flex flex-col gap-2">
            {referred.map((p) => (
              <li key={p.id} className="card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]">
                <Link href={`/admin/fraud/${p.id}`} className="font-extrabold underline">
                  {p.name ?? "(no name)"}
                </Link>
                <p className="text-xs font-bold text-soft">{p.email}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

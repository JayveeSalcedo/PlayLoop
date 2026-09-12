import { getDb, schema } from "@playloop/db";
import { artSVG, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { SponsorToggle } from "./SponsorToggle";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending_review: {
    title: "Waiting for review",
    body: "Only you can see this game. Once it's approved it goes into every player's feed and starts earning.",
  },
  published: {
    title: "Live in the feed",
    body: "Players are finding it now. Plays and earnings update as they come in.",
  },
  rejected: {
    title: "Not approved",
    body: "This game wasn't approved for the feed. Make another one, or change this one and publish it again.",
  },
};

export default async function CreatorGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { profile } = await requireProfile();
  const { id } = await params;
  const { published } = await searchParams;
  const db = getDb();

  const game = await db
    .select()
    .from(schema.games)
    .where(and(eq(schema.games.id, id), eq(schema.games.creatorId, profile.id)))
    .then((r) => r[0]);
  if (!game) notFound();

  const config = (game.config ?? {}) as { item?: ItemKind };
  const copy = STATUS_COPY[game.status] ?? STATUS_COPY.pending_review!;

  // Only fetch the moderator's note when there's a rejection to explain.
  const rejection =
    game.status === "rejected"
      ? await db
          .select({ notes: schema.moderationReviews.notes })
          .from(schema.moderationReviews)
          .where(and(eq(schema.moderationReviews.gameId, game.id), eq(schema.moderationReviews.outcome, "rejected")))
          .orderBy(desc(schema.moderationReviews.decidedAt))
          .limit(1)
          .then((r) => r[0]?.notes ?? null)
      : null;

  return (
    <main className="mx-auto max-w-md p-6">
      {published ? <p className="mb-3 font-extrabold text-mint-foreground">Published — it&apos;s in the queue.</p> : null}

      <div
        className="overflow-hidden rounded-3xl [border:var(--border-thick)]"
        dangerouslySetInnerHTML={{
          __html: artSVG(game.type as GameArtType, game.theme as ThemeName, config.item ?? "bean"),
        }}
      />

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{game.title}</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        {game.difficulty} · up to {game.maxPoints} pts
      </p>

      <div className="mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
        <p className="font-extrabold">{copy.title}</p>
        <p className="mt-1 text-sm font-bold text-soft">{copy.body}</p>
        {rejection ? (
          <div className="mt-3 rounded-xl bg-paper p-3 [border:var(--border-thick)]">
            <p className="text-xs font-extrabold text-soft">What the reviewer said</p>
            <p className="mt-1 text-sm font-bold">{rejection}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Plays</p>
          <p className="text-2xl font-extrabold">{game.playCount.toLocaleString("en-US")}</p>
        </div>
        <div className="rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Earned</p>
          {/* AED 0.02 per play, per the creator earnings explainer in the brief.
              Derived on read — there's no creator_earnings table until payouts exist. */}
          <p className="text-2xl font-extrabold">AED {(game.playCount * 0.02).toFixed(2)}</p>
        </div>
      </div>

      <SponsorToggle gameId={game.id} initial={game.sponsorReady} />

      <div className="mt-6 flex flex-col gap-3">
        <Link href={`/play/${game.slug}`} className="btn block">
          {game.status === "published" ? "See it in the feed" : "Preview it"}
        </Link>
        <Link href="/create/games" className="btn block">
          My games
        </Link>
      </div>
    </main>
  );
}

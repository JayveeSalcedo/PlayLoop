import { artSVG, avatar, type GameArtType, type ThemeName } from "@playloop/ui";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * The challenge landing page — outside the (app) tabbar group, like /play
 * and /onboarding: this is a standalone card, not part of the tabbed nav.
 *
 * Logged-out visitors are sent to /login with the code preserved, rather
 * than hard-redirected via requireSession() — the whole point is a
 * currently-anonymous friend needs to see enough to want to sign up.
 */
export default async function ChallengePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?challenge=${encodeURIComponent(code)}`);

  const db = getDb();
  const row = await db
    .select({
      challenge: schema.challenges,
      game: schema.games,
      sender: schema.profiles,
    })
    .from(schema.challenges)
    .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
    .innerJoin(schema.profiles, eq(schema.challenges.senderId, schema.profiles.id))
    .where(eq(schema.challenges.code, code))
    .then((r) => r[0]);
  if (!row) notFound();
  const { challenge, game, sender } = row;

  if (challenge.senderId === session.sub) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">This is your challenge</h1>
        <p className="mt-2 text-soft">Share the link with a friend instead of opening it yourself.</p>
        <a href="/feed" className="btn go lg block mt-6">
          Home
        </a>
      </main>
    );
  }

  const config = (game.config ?? {}) as { item?: string };
  const art = artSVG(game.type as GameArtType, game.theme as ThemeName, (config.item as any) ?? "bean");

  if (challenge.status === "completed") {
    const won = challenge.winnerId === session.sub;
    const lost = challenge.winnerId === challenge.senderId;
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <div className="card-hard overflow-hidden rounded-3xl [border:var(--border-thick)]" dangerouslySetInnerHTML={{ __html: art }} />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Challenge complete</h1>
        <p className="mt-2 text-soft">
          {won ? "You won this one." : lost ? `${sender.name ?? "They"} won this one.` : "It was a tie."}
        </p>
        <div className="mt-4 flex justify-center gap-6 text-sm font-bold">
          <span>{sender.name ?? "Sender"}: {challenge.senderScore.toLocaleString("en-US")}</span>
        </div>
        <a href="/feed" className="btn go lg block mt-6">
          Home
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <div className="flex items-center justify-center gap-2" dangerouslySetInnerHTML={{ __html: avatar(sender.avatarIndex, 40) }} />
      <p className="mt-2 text-sm font-bold text-soft">{sender.name ?? "A friend"} challenges you</p>
      <div className="card-hard mt-4 overflow-hidden rounded-3xl [border:var(--border-thick)]" dangerouslySetInnerHTML={{ __html: art }} />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{game.title}</h1>
      <p className="mt-2 text-lg font-extrabold">
        Beat <span className="text-violet">{challenge.senderScore.toLocaleString("en-US")}</span>
      </p>
      <p className="mt-3 text-soft">{game.description}</p>
      <a href={`/play/${game.slug}?challenge=${encodeURIComponent(code)}`} className="btn go lg block mt-6">
        Play now
      </a>
    </main>
  );
}

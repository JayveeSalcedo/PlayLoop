import { artSVG, avatar, type GameArtType, type ThemeName } from "@playloop/ui";
import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/app/_components/SubmitButton";
import { getSession } from "@/lib/session";
import { startGuestChallengePlay } from "./actions";

/**
 * The challenge landing page — outside the (app) tabbar group, like /play
 * and /onboarding: this is a standalone card, not part of the tabbed nav.
 *
 * Logged-out visitors are NOT sent to /login: the whole point of this flow
 * is letting a currently-anonymous friend play immediately, and only asking
 * them to log in afterward, to claim what they earned (see
 * startGuestChallengePlay and PlayResultScreen's isGuest branch).
 */
export default async function ChallengePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();

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

  if (session && challenge.senderId === session.sub) {
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
    // An anonymous visitor to an already-resolved link has no result of
    // their own to show — there's no session to compare winnerId against,
    // and guessing at "you" would be wrong more often than not.
    if (!session) {
      return (
        <main className="mx-auto max-w-sm p-6 text-center">
          <div className="card-hard overflow-hidden rounded-3xl [border:var(--border-thick)]" dangerouslySetInnerHTML={{ __html: art }} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">This challenge is already done</h1>
          <p className="mt-2 text-soft">Someone already played this link. Ask {sender.name ?? "them"} for a new one.</p>
          <a href="/login" className="btn go lg block mt-6">
            Log in
          </a>
        </main>
      );
    }
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
      {session ? (
        <a href={`/play/${game.slug}?challenge=${encodeURIComponent(code)}`} className="btn go lg block mt-6">
          Play now
        </a>
      ) : (
        <form action={startGuestChallengePlay}>
          <input type="hidden" name="code" value={code} />
          <SubmitButton pendingText="Loading…">Play now</SubmitButton>
          <p className="mt-2 text-xs text-soft">Jump right in — you can save your score after.</p>
        </form>
      )}
    </main>
  );
}

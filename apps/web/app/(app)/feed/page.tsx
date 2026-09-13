import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@playloop/db";
import { tier, xpNeed } from "@playloop/economy";
import { artSVG, avatar, type GameArtType, type ThemeName } from "@playloop/ui";
import { SurfaceLinks } from "@/app/_components/SurfaceLinks";
import { requireProfile } from "@/lib/profile";

export default async function FeedPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const gameList = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.status, "published"))
    .orderBy(desc(schema.games.createdAt));

  const need = xpNeed(profile.level);

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="mb-6 flex items-center gap-3">
        <div dangerouslySetInnerHTML={{ __html: avatar(profile.avatarIndex, 48) }} />
        <div>
          <p className="text-xs font-bold text-soft">Hey</p>
          <p className="text-xl font-extrabold leading-none">{profile.name}</p>
        </div>
        <div className="ml-auto rounded-full bg-card px-3 py-1 text-sm font-extrabold [border:var(--border-thick)]">
          {profile.pointsBalance.toLocaleString("en-US")} pts
        </div>
      </div>

      <p className="mb-6 text-sm font-bold text-soft">
        Level {profile.level}, {tier(profile.level)} · {profile.xp}/{need} XP
      </p>

      <h2 className="mb-3 text-xl font-extrabold">Games</h2>
      <div className="fade-in grid grid-cols-2 gap-3">
        {gameList.map((g) => {
          const config = (g.config ?? {}) as { item?: string };
          return (
            <Link
              key={g.id}
              href={`/play/${g.slug}`}
              className="card-hard card-hard-hover overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]"
            >
              <div
                className="aspect-[4/3]"
                dangerouslySetInnerHTML={{
                  __html: artSVG(g.type as GameArtType, g.theme as ThemeName, (config.item as any) ?? "bean"),
                }}
              />
              <div className="p-3">
                <p className="font-extrabold leading-tight">{g.title}</p>
                <p className="mt-1 text-xs font-bold text-soft">
                  {g.difficulty} · up to {g.maxPoints} pts
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <SurfaceLinks profile={profile} />

      {gameList.length === 0 ? (
        <p className="mt-6 text-sm text-soft">
          No games yet — run <code>pnpm db:seed</code> to add the starter games.
        </p>
      ) : null}
    </main>
  );
}

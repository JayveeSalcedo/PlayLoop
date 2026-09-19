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
          <p className="text-xl font-extrabold leading-none">
            {profile.name ?? (profile.isGuest ? "Guest Player" : "Player")}
          </p>
        </div>
        <div className="ml-auto rounded-full bg-card px-3 py-1 text-sm font-extrabold [border:var(--border-thick)]">
          {profile.pointsBalance.toLocaleString("en-US")} pts
        </div>
      </div>

      <p className="mb-6 text-sm font-bold text-soft">
        Level {profile.level}, {tier(profile.level)} · {profile.xp}/{need} XP
      </p>

      {/* Sponsored / Featured Spotlight Hero Card — prototype's .spot */}
      {(() => {
        const spotlight = gameList.find((g) => g.sponsorReady) || gameList[0];
        const restGames = spotlight ? gameList.filter((g) => g.id !== spotlight.id) : gameList;

        return (
          <>
            {spotlight && (
              <Link
                href={`/play/${spotlight.slug}`}
                className="card-hard card-hard-hover mb-6 flex flex-col overflow-hidden rounded-3xl bg-card [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-paper">
                  <div
                    className="h-full w-full"
                    dangerouslySetInnerHTML={{
                      __html: artSVG(
                        spotlight.type as GameArtType,
                        spotlight.theme as ThemeName,
                        ((spotlight.config as any)?.item as any) ?? "bean",
                      ),
                    }}
                  />
                  <span className="absolute top-3 left-3 rounded-full bg-lemon px-3 py-1 text-xs font-extrabold text-ink [border:2px_solid_var(--ink)]">
                    {spotlight.sponsorReady ? "Sponsored Spotlight" : "Featured Game"}
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-full bg-card px-2.5 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
                    Up to {spotlight.maxPoints} pts
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-soft">
                        {spotlight.difficulty}
                      </span>
                      <h3 className="text-xl font-extrabold tracking-tight">{spotlight.title}</h3>
                    </div>
                    <span className="btn go sm">
                      Play now
                    </span>
                  </div>
                  {spotlight.description && (
                    <p className="mt-2 text-xs font-semibold text-soft line-clamp-2">
                      {spotlight.description}
                    </p>
                  )}
                </div>
              </Link>
            )}

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-extrabold">All Games</h2>
              <span className="text-xs font-bold text-soft">
                {gameList.length} game{gameList.length === 1 ? "" : "s"} live
              </span>
            </div>

            <div className="fade-in grid grid-cols-2 gap-3">
              {restGames.map((g) => {
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
          </>
        );
      })()}
      <SurfaceLinks profile={profile} />

      {gameList.length === 0 ? (
        <p className="mt-6 text-sm text-soft">
          No games yet — run <code>pnpm db:seed</code> to add the starter games.
        </p>
      ) : null}
    </main>
  );
}

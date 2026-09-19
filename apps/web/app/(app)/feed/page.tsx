import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@playloop/db";
import { tier, xpNeed } from "@playloop/economy";
import { artSVG, avatar, type GameArtType, type ThemeName } from "@playloop/ui";
import { SurfaceLinks } from "@/app/_components/SurfaceLinks";
import { requireProfile } from "@/lib/profile";
import { getLeaguesForProfile } from "@/lib/leagues";
import { AccountSecuredModal } from "./AccountSecuredModal";

export default async function FeedPage(props: {
  searchParams?: Promise<{ accountSecured?: string }>;
}) {
  const params = await props.searchParams;
  const isSecured = params?.accountSecured === "true";
  const { profile } = await requireProfile();
  const db = getDb();

  // Fetch user's joined leagues
  const { joined: joinedLeagues } = await getLeaguesForProfile(profile.id);
  const joinedLeagueIds = joinedLeagues.map((l) => l.id);

  // Games published to leagues the user belongs to
  const leagueGames =
    joinedLeagueIds.length > 0
      ? await db
          .select()
          .from(schema.games)
          .where(
            and(
              eq(schema.games.status, "published"),
              inArray(schema.games.leagueId, joinedLeagueIds),
            ),
          )
          .orderBy(desc(schema.games.createdAt))
      : [];

  const gameList = await db
    .select()
    .from(schema.games)
    .where(
      and(eq(schema.games.status, "published"), isNull(schema.games.leagueId)),
    )
    .orderBy(desc(schema.games.createdAt));

  const need = xpNeed(profile.level);

  return (
    <main className="mx-auto max-w-md p-6">
      {isSecured && (
        <AccountSecuredModal
          email={profile.email}
          pointsBalance={profile.pointsBalance}
          level={profile.level}
        />
      )}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="shrink-0"
          dangerouslySetInnerHTML={{ __html: avatar(profile.avatarIndex, 48) }}
        />
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold leading-none">
            {profile.name ?? (profile.isGuest ? "Guest Player" : "Player")}
          </p>
        </div>
        <Link
          href="/wallet"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-extrabold [border:var(--border-thick)] [box-shadow:var(--shadow-hard-sm)] hover:scale-[1.02] transition-transform"
        >
          <span className="coin sm" aria-hidden="true" />
          <span>{profile.pointsBalance.toLocaleString("en-US")} pts</span>
        </Link>
      </div>

      <p className="mb-6 text-sm font-bold text-soft">
        Level {profile.level}, {tier(profile.level)} · {profile.xp}/{need} XP
      </p>

      {/* Sponsored / Featured Spotlight Hero Card — prototype's .spot */}
      {(() => {
        const spotlight = gameList.find((g) => g.sponsorReady) || gameList[0];
        const restGames = spotlight
          ? gameList.filter((g) => g.id !== spotlight.id)
          : gameList;

        return (
          <>
            {spotlight && (
              <Link
                href={`/play/${spotlight.slug}`}
                className="card-hard card-hard-hover mb-6 flex flex-col overflow-hidden rounded-3xl bg-card [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-paper">
                  {spotlight.coverImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={spotlight.coverImage}
                      alt={spotlight.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
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
                  )}
                  <span className="absolute top-3 left-3 rounded-full bg-lemon px-3 py-1 text-xs font-extrabold text-ink [border:2px_solid_var(--ink)]">
                    {spotlight.sponsorReady
                      ? "Sponsored Spotlight"
                      : "Featured Game"}
                  </span>
                  <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)] [box-shadow:var(--shadow-hard-sm)]">
                    <span className="coin sm" aria-hidden="true" />
                    Up to {spotlight.maxPoints} pts
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-soft">
                        {spotlight.difficulty}
                      </span>
                      <h3 className="text-xl font-extrabold tracking-tight">
                        {spotlight.title}
                      </h3>
                    </div>
                    <span className="btn go sm">Play now</span>
                  </div>
                  {spotlight.description && (
                    <p className="mt-2 text-xs font-semibold text-soft line-clamp-2">
                      {spotlight.description}
                    </p>
                  )}
                </div>
              </Link>
            )}

            {leagueGames.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-extrabold">Your League Games</h2>
                  <span className="text-xs font-bold text-soft">
                    {leagueGames.length} game
                    {leagueGames.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="fade-in mb-6 grid grid-cols-2 gap-3">
                  {leagueGames.map((g) => {
                    const config = (g.config ?? {}) as { item?: string };
                    const league = joinedLeagues.find(
                      (l) => l.id === g.leagueId,
                    );
                    return (
                      <Link
                        key={g.id}
                        href={`/play/${g.slug}`}
                        className="card-hard card-hard-hover overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]"
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                          {g.coverImage ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={g.coverImage}
                              alt={g.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className="h-full w-full"
                              dangerouslySetInnerHTML={{
                                __html: artSVG(
                                  g.type as GameArtType,
                                  g.theme as ThemeName,
                                  (config.item as any) ?? "bean",
                                ),
                              }}
                            />
                          )}
                          {league ? (
                            <span
                              className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-ink [border:1.5px_solid_var(--ink)]"
                              style={{ backgroundColor: league.color }}
                            >
                              {league.name}
                            </span>
                          ) : null}
                        </div>
                        <div className="p-3">
                          <p className="font-extrabold leading-tight">
                            {g.title}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-soft">
                            <span>{g.difficulty}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-extrabold text-ink">
                              <span className="coin sm" aria-hidden="true" />
                              {g.maxPoints} pts
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : null}

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
                    <div className="aspect-[4/3] overflow-hidden bg-paper">
                      {g.coverImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={g.coverImage}
                          alt={g.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="h-full w-full"
                          dangerouslySetInnerHTML={{
                            __html: artSVG(
                              g.type as GameArtType,
                              g.theme as ThemeName,
                              (config.item as any) ?? "bean",
                            ),
                          }}
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-extrabold leading-tight">{g.title}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-soft">
                        <span>{g.difficulty}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-extrabold text-ink">
                          <span className="coin sm" aria-hidden="true" />
                          {g.maxPoints} pts
                        </span>
                      </div>
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

import { getDb, schema } from "@playloop/db";
import { artSVG, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { requireProfile } from "@/lib/profile";

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending_review: { text: "Pending review", className: "bg-lemon" },
  published: { text: "Live", className: "bg-mint" },
  rejected: { text: "Not approved", className: "bg-gum text-paper" },
};

export default async function MyGamesPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const games = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.creatorId, profile.id))
    .orderBy(desc(schema.games.createdAt));

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">My games</h1>

      {games.length === 0 ? (
        <p className="mt-4 font-bold text-soft">
          You haven&apos;t made a game yet.{" "}
          <Link href="/create" className="underline">
            Make your first one.
          </Link>
        </p>
      ) : (
        <div className="fade-in mt-6 flex flex-col gap-3">
          {games.map((g) => {
            const config = (g.config ?? {}) as { item?: ItemKind };
            const badge = STATUS_LABEL[g.status] ?? STATUS_LABEL.pending_review!;
            return (
              <Link
                key={g.id}
                href={`/create/games/${g.id}`}
                className="card-hard row-hard-hover flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-3 [border:var(--border-thick)]"
              >
                <div
                  className="h-14 w-20 shrink-0 overflow-hidden rounded-xl [border:var(--border-thick)]"
                  dangerouslySetInnerHTML={{
                    __html: artSVG(g.type as GameArtType, g.theme as ThemeName, config.item ?? "bean"),
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate font-extrabold">{g.title}</p>
                  <p className="text-xs font-bold text-soft">
                    {g.playCount.toLocaleString("en-US")} plays · up to {g.maxPoints} pts
                  </p>
                </div>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-extrabold [border:var(--border-thick)] ${badge.className}`}>
                  {badge.text}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/create" className="btn go block mt-6">
        Make another game
      </Link>
    </main>
  );
}

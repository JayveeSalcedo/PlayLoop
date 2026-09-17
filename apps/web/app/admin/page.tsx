import { getDb, schema } from "@playloop/db";
import type { QuizQuestion } from "@playloop/games";
import type { GameMeta } from "@playloop/runtime";
import { artSVG, type GameArtType, type ItemKind, type ThemeName } from "@playloop/ui";
import { formatAed } from "@playloop/economy";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { FundButton, ReviewCard } from "./ReviewCard";
import { ReviewGamePreview } from "./ReviewGamePreview";

const VIA_LABEL: Record<string, string> = {
  "ai-create": "Made by AI",
  "ai-change": "Changed by AI",
  "ai-fix": "Fixed by AI",
  template: "From an example",
  manual: "Added by hand",
};

export default async function AdminPage() {
  await requireAdmin();
  const db = getDb();

  // Campaigns waiting on us to confirm the brand actually paid. This is the
  // whole of "funding" — there's no Stripe integration by design.
  const unfunded = await db
    .select({
      id: schema.campaigns.id,
      budgetFils: schema.campaigns.budgetFils,
      startsOn: schema.campaigns.startsOn,
      endsOn: schema.campaigns.endsOn,
      brandName: schema.brands.name,
      gameTitle: schema.games.title,
      rewardName: schema.rewards.name,
    })
    .from(schema.campaigns)
    .innerJoin(schema.brands, eq(schema.campaigns.brandId, schema.brands.id))
    .innerJoin(schema.games, eq(schema.campaigns.gameId, schema.games.id))
    .innerJoin(schema.rewards, eq(schema.campaigns.rewardId, schema.rewards.id))
    .where(and(isNull(schema.campaigns.fundedAt), isNull(schema.campaigns.cancelledAt)))
    .orderBy(asc(schema.campaigns.createdAt));

  // Oldest first — a review queue should be answered in the order people waited.
  const pending = await db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      type: schema.games.type,
      gameKind: schema.games.gameKind,
      currentVersionId: schema.games.currentVersionId,
      title: schema.games.title,
      description: schema.games.description,
      theme: schema.games.theme,
      difficulty: schema.games.difficulty,
      maxPoints: schema.games.maxPoints,
      config: schema.games.config,
      createdAt: schema.games.createdAt,
      creatorName: schema.profiles.name,
    })
    .from(schema.games)
    .leftJoin(schema.profiles, eq(schema.games.creatorId, schema.profiles.id))
    .where(eq(schema.games.status, "pending_review"))
    .orderBy(asc(schema.games.createdAt));

  // Every version of every pending code game, oldest first: the full request
  // history a reviewer sees alongside the version actually up for review.
  const codeGameIds = pending.filter((g) => g.gameKind === "code").map((g) => g.id);
  const versionsByGame = new Map<string, (typeof schema.gameVersions.$inferSelect)[]>();
  if (codeGameIds.length > 0) {
    const versions = await db
      .select()
      .from(schema.gameVersions)
      .where(inArray(schema.gameVersions.gameId, codeGameIds))
      .orderBy(asc(schema.gameVersions.gameId), asc(schema.gameVersions.versionNumber));
    for (const v of versions) {
      const list = versionsByGame.get(v.gameId) ?? [];
      list.push(v);
      versionsByGame.set(v.gameId, list);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      {unfunded.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xl font-extrabold">Campaigns awaiting funding</h2>
          <p className="mt-1 mb-3 text-sm font-bold text-soft">
            Confirm the money arrived. Nothing counts for the brand until you do.
          </p>
          <div className="fade-in flex flex-col gap-3">
            {unfunded.map((c) => (
              <div key={c.id} className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
                <p className="font-extrabold">
                  {c.brandName} · {formatAed(c.budgetFils)}
                </p>
                <p className="mt-1 text-xs font-bold text-soft">
                  {c.gameTitle} · {c.rewardName} · {c.startsOn} to {c.endsOn}
                </p>
                <FundButton campaignId={c.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <h1 className="text-3xl font-extrabold tracking-tight">Moderation</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        {pending.length === 0
          ? "Nothing waiting for review."
          : `${pending.length} game${pending.length === 1 ? "" : "s"} waiting for review.`}
      </p>

      <div className="fade-in mt-6 flex flex-col gap-5">
        {pending.map((g) => {
          const config = (g.config ?? {}) as {
            questions?: QuizQuestion[];
            images?: (string | null)[];
            item?: ItemKind;
            target?: string;
          };
          const isCode = g.gameKind === "code";
          const versions = isCode ? (versionsByGame.get(g.id) ?? []) : [];
          const current = versions.find((v) => v.id === g.currentVersionId);
          const currentMeta = current?.meta as unknown as GameMeta | undefined;
          const report = (current?.report ?? {}) as {
            checks?: { title: string; status: string; summary: string; details?: string[] }[];
          };

          return (
            <section key={g.id} className="card-hard overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]">
              <div className="flex gap-4 p-4">
                <div
                  className="h-24 w-32 shrink-0 overflow-hidden rounded-xl [border:var(--border-thick)]"
                  dangerouslySetInnerHTML={{
                    __html: artSVG(isCode ? null : (g.type as GameArtType), g.theme as ThemeName, config.item ?? "bean"),
                  }}
                />
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold leading-tight">{g.title}</h2>
                  <p className="text-xs font-bold text-soft">
                    {isCode ? "Code game" : g.type} · {g.difficulty} · up to {g.maxPoints} pts
                  </p>
                  <p className="mt-1 text-xs font-bold text-soft">
                    by {g.creatorName ?? "unknown"} · {g.createdAt.toLocaleDateString("en-GB")}
                  </p>
                  <p className="mt-2 text-sm text-soft">{g.description}</p>
                  <Link href={`/play/${g.slug}`} className="mt-2 inline-block text-xs font-extrabold underline">
                    Open the game page
                  </Link>
                </div>
              </div>

              {/* The content is the thing being judged — show it, don't just
                  summarise it, or approving is a rubber stamp. */}
              <div className="border-t-2 border-ink/10 p-4">
                {isCode ? (
                  current && currentMeta ? (
                    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                      <ReviewGamePreview code={current.code} runtimeVersion={current.runtimeVersion} meta={currentMeta} />

                      <div className="min-w-0">
                        {current.summary ? <p className="text-sm text-soft">{current.summary}</p> : null}
                        {current.notes ? <p className="mt-2 text-xs font-bold text-soft">AI notes: {current.notes}</p> : null}

                        {versions.length > 1 ? (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-extrabold text-soft">
                              Full request history ({versions.length} version{versions.length === 1 ? "" : "s"})
                            </summary>
                            <ol className="mt-2 flex flex-col gap-1">
                              {versions.map((v) => (
                                <li key={v.id} className="text-xs font-bold">
                                  <span className={v.id === current.id ? "text-ink" : "text-soft"}>
                                    v{v.versionNumber} · {VIA_LABEL[v.via] ?? v.via}
                                    {v.request ? `: "${v.request}"` : ""}
                                    {v.id === current.id ? " (this version)" : ""}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-soft">
                            {VIA_LABEL[current.via] ?? current.via}
                            {current.request ? `: "${current.request}"` : ""}
                          </p>
                        )}

                        <details className="mt-3" open>
                          <summary className="cursor-pointer text-xs font-extrabold text-soft">
                            Automated checks this version already passed
                          </summary>
                          <p className="mt-1 text-xs text-soft">
                            These cover safety, determinism and mechanics — not content. That judgement is why this is here.
                          </p>
                          <ul className="mt-2 flex flex-col gap-1">
                            {(report.checks ?? []).map((c) => (
                              <li key={c.title} className="text-xs font-bold">
                                <span className={c.status === "fail" ? "text-gum" : "text-soft"}>
                                  {c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "!"} {c.title}: {c.summary}
                                </span>
                                {c.details && c.details.length > 0 ? (
                                  <ul className="ml-4 mt-0.5 list-disc text-soft">
                                    {c.details.map((d, i) => (
                                      <li key={i}>{d}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-gum">This game has no reviewable version.</p>
                  )
                ) : (
                  <>
                    {g.type === "quiz" ? (
                      <ol className="flex flex-col gap-3">
                        {(config.questions ?? []).map((q, i) => (
                          <li key={i}>
                            <p className="text-sm font-extrabold">
                              {i + 1}. {q.q}
                            </p>
                            <ul className="mt-1 flex flex-wrap gap-2">
                              {q.a.map((a, k) => (
                                <li
                                  key={k}
                                  className={`rounded-lg px-2 py-1 text-xs font-bold [border:var(--border-thick)] ${
                                    q.c === k ? "bg-mint" : "bg-paper text-soft"
                                  }`}
                                >
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    ) : null}

                    {g.type === "memory" ? (
                      <div className="flex flex-wrap gap-2">
                        {(config.images ?? []).filter(Boolean).length === 0 ? (
                          <p className="text-sm font-bold text-soft">No custom images — uses the built-in shape pack.</p>
                        ) : (
                          (config.images ?? []).map((im, i) =>
                            im ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={im}
                                alt={`Pair ${i + 1}`}
                                className="h-20 w-20 rounded-xl object-cover [border:var(--border-thick)]"
                              />
                            ) : null,
                          )
                        )}
                      </div>
                    ) : null}

                    {g.type === "catch" ? (
                      <p className="text-sm font-bold text-soft">Falling item: {config.item ?? "bean"}</p>
                    ) : null}
                    {g.type === "reflex" ? (
                      <p className="text-sm font-bold text-soft">Target colour: {config.target ?? "mint"}</p>
                    ) : null}
                  </>
                )}
              </div>

              <ReviewCard gameId={g.id} title={g.title} />
            </section>
          );
        })}
      </div>
    </main>
  );
}

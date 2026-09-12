import { getDb, schema } from "@playloop/db";
import { campaignStatus, formatAed } from "@playloop/economy";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { SignOut } from "@/app/_components/SignOut";
import { requireBrandMember } from "@/lib/brand";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-paper text-soft",
  scheduled: "bg-lemon",
  live: "bg-mint",
  complete: "bg-card text-soft",
  cancelled: "bg-gum text-paper",
};

export default async function BrandPage() {
  const { brand } = await requireBrandMember();
  const db = getDb();

  const campaigns = await db
    .select({
      id: schema.campaigns.id,
      budgetFils: schema.campaigns.budgetFils,
      startsOn: schema.campaigns.startsOn,
      endsOn: schema.campaigns.endsOn,
      fundedAt: schema.campaigns.fundedAt,
      cancelledAt: schema.campaigns.cancelledAt,
      gameTitle: schema.games.title,
      rewardName: schema.rewards.name,
    })
    .from(schema.campaigns)
    .innerJoin(schema.games, eq(schema.campaigns.gameId, schema.games.id))
    .innerJoin(schema.rewards, eq(schema.campaigns.rewardId, schema.rewards.id))
    .where(eq(schema.campaigns.brandId, brand.id))
    .orderBy(desc(schema.campaigns.createdAt));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-soft">Brand console</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{brand.name}</h1>
        </div>
        <SignOut className="btn sm" />
      </div>
      {brand.description ? <p className="mt-1 text-sm font-bold text-soft">{brand.description}</p> : null}

      <Link href="/brand/new" className="btn go mt-6 inline-flex">
        New campaign
      </Link>

      <h2 className="mt-8 text-xl font-extrabold">Campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-soft">No campaigns yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {campaigns.map((c) => {
            const status = campaignStatus(c);
            return (
              <Link
                key={c.id}
                href={`/brand/campaigns/${c.id}`}
                className="flex items-center gap-3 rounded-2xl bg-card p-4 [border:var(--border-thick)]"
              >
                <div className="min-w-0">
                  <p className="font-extrabold">{c.gameTitle}</p>
                  <p className="text-xs font-bold text-soft">
                    {c.rewardName} · {formatAed(c.budgetFils)} · {c.startsOn} to {c.endsOn}
                  </p>
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-extrabold [border:var(--border-thick)] ${STATUS_STYLE[status]}`}
                >
                  {status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

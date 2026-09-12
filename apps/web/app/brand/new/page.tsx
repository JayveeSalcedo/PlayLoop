import { getDb, schema } from "@playloop/db";
import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { requireBrandMember } from "@/lib/brand";
import { CampaignForm } from "./CampaignForm";

export default async function NewCampaignPage() {
  const { brand } = await requireBrandMember();
  const db = getDb();

  // A campaign can only sponsor a game that's actually live, and can only fund
  // one of this brand's own reward pools.
  const [games, rewards] = await Promise.all([
    db
      .select({
        id: schema.games.id,
        title: schema.games.title,
        playCount: schema.games.playCount,
        brandOriginal: schema.games.brandOriginal,
        sponsorReady: schema.games.sponsorReady,
      })
      .from(schema.games)
      .where(eq(schema.games.status, "published"))
      .orderBy(asc(schema.games.title)),
    db
      .select({
        id: schema.rewards.id,
        name: schema.rewards.name,
        poolTotal: schema.rewards.poolTotal,
        poolRemaining: schema.rewards.poolRemaining,
      })
      .from(schema.rewards)
      .where(and(eq(schema.rewards.brandId, brand.id), eq(schema.rewards.active, true)))
      .orderBy(asc(schema.rewards.name)),
  ]);

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href="/brand" className="text-sm font-extrabold underline">
        Back
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">New campaign</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        Fund a reward pool on a game for a run of days. It stays a draft until we confirm your payment.
      </p>

      {rewards.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-card p-4 font-bold text-soft [border:var(--border-thick)]">
          {brand.name} has no active rewards to fund yet.
        </p>
      ) : (
        <CampaignForm games={games} rewards={rewards} />
      )}
    </main>
  );
}

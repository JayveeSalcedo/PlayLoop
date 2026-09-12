import { getDb, schema } from "@playloop/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { RewardRow } from "./RewardRow";
import { NewRewardForm } from "./RewardForm";

export default async function AdminRewardsPage() {
  await requireAdmin();
  const db = getDb();

  const [rewards, brands] = await Promise.all([
    db
      .select({
        id: schema.rewards.id,
        name: schema.rewards.name,
        description: schema.rewards.description,
        brandId: schema.rewards.brandId,
        brandName: schema.brands.name,
        category: schema.rewards.category,
        costPoints: schema.rewards.costPoints,
        theme: schema.rewards.theme,
        icon: schema.rewards.icon,
        poolTotal: schema.rewards.poolTotal,
        poolRemaining: schema.rewards.poolRemaining,
        active: schema.rewards.active,
      })
      .from(schema.rewards)
      .innerJoin(schema.brands, eq(schema.rewards.brandId, schema.brands.id))
      .orderBy(asc(schema.rewards.name)),
    db
      .select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands)
      .orderBy(asc(schema.brands.name)),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Rewards</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        The whole catalogue, including anything switched off. Deactivating hides a reward from players
        but leaves vouchers already issued for it redeemable.
      </p>

      <NewRewardForm brands={brands} />

      <div className="mt-8 flex flex-col gap-3">
        {rewards.map((r) => (
          <RewardRow key={r.id} reward={r} brands={brands} />
        ))}
      </div>
    </main>
  );
}

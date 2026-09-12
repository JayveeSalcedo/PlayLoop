import { eq } from "drizzle-orm";
import { getDb, schema } from "@playloop/db";
import { requireProfile } from "@/lib/profile";
import { RewardsBoard } from "./RewardsBoard";

export default async function RewardsPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const rewardsList = await db
    .select({
      id: schema.rewards.id,
      brandName: schema.brands.name,
      name: schema.rewards.name,
      description: schema.rewards.description,
      category: schema.rewards.category,
      costPoints: schema.rewards.costPoints,
      theme: schema.rewards.theme,
      icon: schema.rewards.icon,
      poolTotal: schema.rewards.poolTotal,
      poolRemaining: schema.rewards.poolRemaining,
    })
    .from(schema.rewards)
    .innerJoin(schema.brands, eq(schema.rewards.brandId, schema.brands.id))
    .where(eq(schema.rewards.active, true))
    .orderBy(schema.rewards.costPoints);

  return <RewardsBoard pointsBalance={profile.pointsBalance} rewards={rewardsList} />;
}

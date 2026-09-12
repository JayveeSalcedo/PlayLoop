import { eq } from "drizzle-orm";
import { getDb, schema } from "@playloop/db";
import { requireProfile } from "@/lib/profile";
import { RewardsBoard } from "./RewardsBoard";

export default async function RewardsPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const rewardsList = await db
    .select()
    .from(schema.rewards)
    .where(eq(schema.rewards.active, true))
    .orderBy(schema.rewards.costPoints);

  return <RewardsBoard pointsBalance={profile.pointsBalance} rewards={rewardsList} />;
}

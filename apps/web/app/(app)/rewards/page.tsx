import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@playloop/db";
import { requireSession } from "@/lib/session";
import { RewardsBoard } from "./RewardsBoard";

export default async function RewardsPage() {
  const session = await requireSession();
  const db = getDb();

  const [profile, rewardsList] = await Promise.all([
    db
      .select({ pointsBalance: schema.profiles.pointsBalance })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, session.sub))
      .then((r) => r[0]!),
    db
      .select()
      .from(schema.rewards)
      .where(and(eq(schema.rewards.active, true)))
      .orderBy(schema.rewards.costPoints),
  ]);

  return <RewardsBoard pointsBalance={profile.pointsBalance} rewards={rewardsList} />;
}

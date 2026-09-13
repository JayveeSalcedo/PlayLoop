import { getDb, schema } from "@playloop/db";
import { campaignStatus } from "@playloop/economy";
import { desc, eq, inArray } from "drizzle-orm";
import { Hero } from "./Hero";
import { LoopSection } from "./LoopSection";
import { Nav } from "./Nav";
import { Sides } from "./Sides";

/**
 * Marketing landing page for a signed-out visitor. Rendered by app/page.tsx
 * when there's no session — a signed-in visitor never reaches this, they're
 * redirected to /feed before this component is ever constructed.
 */
export async function Landing() {
  const db = getDb();

  // Popularity, not recency: proof the app has already been played matters
  // more here than what's newest, unlike /feed's own createdAt-desc order.
  const heroGames = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.status, "published"))
    .orderBy(desc(schema.games.playCount))
    .limit(3);

  const gameIds = heroGames.map((g) => g.id);

  const sponsorRows = gameIds.length
    ? await db
        .select({
          gameId: schema.campaigns.gameId,
          brandName: schema.brands.name,
          startsOn: schema.campaigns.startsOn,
          endsOn: schema.campaigns.endsOn,
          fundedAt: schema.campaigns.fundedAt,
          cancelledAt: schema.campaigns.cancelledAt,
        })
        .from(schema.campaigns)
        .innerJoin(schema.brands, eq(schema.campaigns.brandId, schema.brands.id))
        .where(inArray(schema.campaigns.gameId, gameIds))
    : [];

  // Two queries rather than one games⟕campaigns⟕brands join: a game can have
  // several historical campaigns, and this only ever wants its current one.
  const sponsorByGameId = new Map(
    sponsorRows.filter((c) => campaignStatus(c) === "live").map((c) => [c.gameId, c.brandName]),
  );

  return (
    <>
      <Nav />
      <main>
        <Hero games={heroGames} sponsorByGameId={sponsorByGameId} />
        <LoopSection />
        <Sides />
      </main>
    </>
  );
}

/**
 * Seeds the four starter games and four starter rewards, ported from the
 * prototype's sample data (reference/playloop-prototype.html, lines
 * 1040-1048 and 1358-1364). Run with `pnpm db:seed`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { brandMembers, brands, games, leagueMembers, leagues, profiles, rewards, storeStaff, stores } from "./schema.js";

// Load the monorepo root .env regardless of CWD (see apps/web/next.config.ts for the same pattern).
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main() {
  const db = getDb();

  // Ensure leagues and league_members tables exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS leagues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      kind text NOT NULL,
      code text NOT NULL UNIQUE,
      description text,
      icon text NOT NULL DEFAULT 'trophy',
      color text NOT NULL DEFAULT '#3FC8FF',
      creator_id uuid REFERENCES profiles(id),
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS league_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      team_name text,
      joined_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT league_members_league_profile_unique UNIQUE (league_id, profile_id)
    );
    CREATE INDEX IF NOT EXISTS league_members_league_id_idx ON league_members(league_id);
    CREATE INDEX IF NOT EXISTS league_members_profile_id_idx ON league_members(profile_id);
  `);

  await db
    .insert(games)
    .values([
      {
        slug: "bean-catcher",
        type: "catch",
        title: "Bean Catcher",
        description:
          "Drag the cup to catch falling beans. Golden beans are worth triple. Dodge the spiky ones.",
        theme: "ember",
        difficulty: "Easy",
        maxPoints: 250,
        config: { item: "bean" },
        brandOriginal: true,
        status: "published",
      },
      {
        slug: "desert-genius",
        type: "quiz",
        title: "Desert Genius",
        description: "Five quick questions on the UAE. Answer fast for a speed bonus.",
        theme: "sun",
        difficulty: "Medium",
        maxPoints: 200,
        config: {
          questions: [
            { q: "Which city is the capital of the UAE?", a: ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain"], c: 1 },
            { q: "In which year was the UAE founded?", a: ["1968", "1971", "1975", "1980"], c: 1 },
            { q: "How many emirates make up the UAE?", a: ["Five", "Six", "Seven", "Nine"], c: 2 },
            {
              q: "Which city is known as the Garden City, home to UNESCO-listed oases?",
              a: ["Al Ain", "Fujairah", "Ajman", "Ras Al Khaimah"],
              c: 0,
            },
            {
              q: "The world's tallest building stands in which city?",
              a: ["Abu Dhabi", "Riyadh", "Dubai", "Doha"],
              c: 2,
            },
          ],
        },
        brandOriginal: false,
        status: "published",
      },
      {
        slug: "neon-pairs",
        type: "memory",
        title: "Neon Pairs",
        description: "Flip cards and match all six pairs before the clock runs out. Faster means a bigger time bonus.",
        theme: "neon",
        difficulty: "Medium",
        maxPoints: 180,
        config: {},
        brandOriginal: false,
        status: "published",
      },
      {
        slug: "tap-frenzy",
        type: "reflex",
        title: "Tap Frenzy",
        description: "Tap the smiling orbs. Avoid the spiky ones. Chain hits for a combo multiplier.",
        theme: "bloom",
        difficulty: "Hard",
        maxPoints: 300,
        config: { target: "mint" },
        brandOriginal: false,
        status: "published",
      },
    ])
    .onConflictDoNothing({ target: games.slug });

  // Brands first — rewards and stores both reference one by id.
  await db
    .insert(brands)
    .values([
      { slug: "beanhouse", name: "Beanhouse", description: "Speciality coffee, eight stores across the UAE.", theme: "ember" },
      { slug: "glow-arcade", name: "Glow Arcade", description: "Neon-lit arcades and party spaces.", theme: "neon" },
      { slug: "nomad-books", name: "Nomad Books", description: "Independent bookshop and reading room.", theme: "mint" },
    ])
    .onConflictDoNothing({ target: brands.slug });

  const brandIds = new Map(
    (await db.select({ slug: brands.slug, id: brands.id }).from(brands)).map((b) => [b.slug, b.id]),
  );
  const brandId = (slug: string) => {
    const id = brandIds.get(slug);
    if (!id) throw new Error(`Brand ${slug} missing — seed brands before rewards/stores.`);
    return id;
  };

  await db
    .insert(rewards)
    .values([
      {
        slug: "free-flat-white",
        brandId: brandId("beanhouse"),
        name: "Free flat white",
        description: "Redeem at any Beanhouse store.",
        category: "Food and drink",
        costPoints: 500,
        theme: "ember",
        icon: "cup",
        poolTotal: 1000,
        poolRemaining: 1000,
      },
      {
        slug: "any-pastry",
        brandId: brandId("beanhouse"),
        name: "Any pastry",
        description: "Your pick from the case.",
        category: "Food and drink",
        costPoints: 350,
        theme: "sun",
        icon: "star",
      },
      {
        slug: "arcade-pass",
        brandId: brandId("glow-arcade"),
        name: "60-minute arcade pass",
        description: "Unlimited play for an hour.",
        category: "Fun",
        costPoints: 900,
        theme: "neon",
        icon: "bolt",
      },
      {
        slug: "nomad-books-voucher",
        brandId: brandId("nomad-books"),
        name: "AED 25 voucher",
        description: "Toward any purchase in store.",
        category: "Shopping",
        costPoints: 1100,
        theme: "mint",
        icon: "book",
      },
    ])
    .onConflictDoNothing({ target: rewards.slug });

  // Counters where a voucher can be handed over. The staff scanner checks a
  // voucher's brand against its store's brand, so these share the brand ids
  // above. Attaching a person to a store is a manual INSERT — see the README —
  // because store staff need a real logged-in profile first.
  await db
    .insert(stores)
    .values([
      { slug: "beanhouse-marina", brandId: brandId("beanhouse"), name: "Marina", city: "Dubai" },
      { slug: "beanhouse-downtown", brandId: brandId("beanhouse"), name: "Downtown", city: "Dubai" },
      { slug: "glow-arcade-yas", brandId: brandId("glow-arcade"), name: "Yas Bay", city: "Abu Dhabi" },
    ])
    .onConflictDoNothing({ target: stores.slug });

  // Attach all existing profiles to Beanhouse brand & Marina store for testing
  const allProfiles = await db.select({ id: profiles.id }).from(profiles);
  const marinaStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, "beanhouse-marina"))
    .then((r) => r[0]);

  for (const p of allProfiles) {
    await db
      .insert(brandMembers)
      .values({ brandId: brandId("beanhouse"), profileId: p.id })
      .onConflictDoNothing();

    if (marinaStore) {
      await db
        .insert(storeStaff)
        .values({ storeId: marinaStore.id, profileId: p.id })
        .onConflictDoNothing();
    }
  }

  // Seed demo leagues matching the prototype
  await db
    .insert(leagues)
    .values([
      {
        code: "HORIZON-8B",
        name: "Schools Cup",
        kind: "school",
        icon: "cap",
        color: "#3FC8FF",
        description: "Horizon Academy Grade 8. Class vs class, teacher-built quizzes.",
      },
      {
        code: "OASIS-MALL",
        name: "Oasis Mall Players",
        kind: "mall",
        icon: "bag",
        color: "#FFDD3C",
        description: "Individual ranking at your mall. Shoppers compete for tenant rewards.",
      },
      {
        code: "FAMILY-NOVA",
        name: "Year of Family: Growing in Unity",
        kind: "family",
        icon: "heart",
        color: "#FF5FA2",
        description: "Parents and kids play as one team. Team Nova.",
      },
      {
        code: "ACME-TECH",
        name: "Acme Tech Hub",
        kind: "company",
        icon: "briefcase",
        color: "#22D39B",
        description: "Engineering & Design department competition.",
      },
    ])
    .onConflictDoNothing({ target: leagues.code });

  const seededLeagues = await db.select().from(leagues);
  const familyLeague = seededLeagues.find((l) => l.code === "FAMILY-NOVA");
  const mallLeague = seededLeagues.find((l) => l.code === "OASIS-MALL");

  for (const p of allProfiles) {
    if (familyLeague) {
      await db
        .insert(leagueMembers)
        .values({
          leagueId: familyLeague.id,
          profileId: p.id,
          teamName: "Team Nova",
          role: "admin",
        })
        .onConflictDoNothing();
    }
    if (mallLeague) {
      await db
        .insert(leagueMembers)
        .values({
          leagueId: mallLeague.id,
          profileId: p.id,
          teamName: "Mall Shoppers",
          role: "member",
        })
        .onConflictDoNothing();
    }
  }

  console.log("Seeded leagues: HORIZON-8B, OASIS-MALL, FAMILY-NOVA, ACME-TECH");
  console.log("Seeded brands: beanhouse, glow-arcade, nomad-books");
  console.log("Seeded games: bean-catcher, desert-genius, neon-pairs, tap-frenzy");
  console.log("Seeded rewards: free-flat-white, any-pastry, arcade-pass, nomad-books-voucher");
  console.log("Seeded stores: beanhouse-marina, beanhouse-downtown, glow-arcade-yas");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

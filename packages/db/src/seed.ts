/**
 * Seeds the four starter games and four starter rewards, ported from the
 * prototype's sample data (reference/playloop-prototype.html, lines
 * 1040-1048 and 1358-1364). Run with `pnpm db:seed`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb } from "./client";
import { games, rewards, stores } from "./schema";

// Load the monorepo root .env regardless of CWD (see apps/web/next.config.ts for the same pattern).
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main() {
  const db = getDb();

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

  await db
    .insert(rewards)
    .values([
      {
        slug: "free-flat-white",
        brandName: "Beanhouse",
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
        brandName: "Beanhouse",
        name: "Any pastry",
        description: "Your pick from the case.",
        category: "Food and drink",
        costPoints: 350,
        theme: "sun",
        icon: "star",
      },
      {
        slug: "arcade-pass",
        brandName: "Glow Arcade",
        name: "60-minute arcade pass",
        description: "Unlimited play for an hour.",
        category: "Fun",
        costPoints: 900,
        theme: "neon",
        icon: "bolt",
      },
      {
        slug: "nomad-books-voucher",
        brandName: "Nomad Books",
        name: "AED 25 voucher",
        description: "Toward any purchase in store.",
        category: "Shopping",
        costPoints: 1100,
        theme: "mint",
        icon: "book",
      },
    ])
    .onConflictDoNothing({ target: rewards.slug });

  // Counters where a voucher can be handed over. brandName matches the
  // rewards above, which is what the staff scanner checks a voucher against.
  // Attaching a person to one of these is a manual INSERT — see the README —
  // because store staff need a real logged-in profile first.
  await db
    .insert(stores)
    .values([
      { slug: "beanhouse-marina", brandName: "Beanhouse", name: "Marina", city: "Dubai" },
      { slug: "beanhouse-downtown", brandName: "Beanhouse", name: "Downtown", city: "Dubai" },
      { slug: "glow-arcade-yas", brandName: "Glow Arcade", name: "Yas Bay", city: "Abu Dhabi" },
    ])
    .onConflictDoNothing({ target: stores.slug });

  console.log("Seeded games: bean-catcher, desert-genius, neon-pairs, tap-frenzy");
  console.log("Seeded rewards: free-flat-white, any-pastry, arcade-pass, nomad-books-voucher");
  console.log("Seeded stores: beanhouse-marina, beanhouse-downtown, glow-arcade-yas");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

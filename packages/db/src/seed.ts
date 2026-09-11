/**
 * Seeds the four starter games, ported from the prototype's sample data
 * (reference/playloop-prototype.html, lines 1040-1048). Run with `pnpm db:seed`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb } from "./client";
import { games } from "./schema";

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
        published: true,
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
        published: true,
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
        published: true,
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
        published: true,
      },
    ])
    .onConflictDoNothing({ target: games.slug });

  console.log("Seeded games: bean-catcher, desert-genius, neon-pairs, tap-frenzy");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

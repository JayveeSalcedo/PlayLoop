"use server";

import { getDb, schema } from "@playloop/db";
import {
  normalizeConfig,
  validateGameDraft,
  type GameDraft,
} from "@playloop/games";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PENDING_LIMIT } from "@/lib/moderation";
import { requireProfile } from "@/lib/profile";

/**
 * How many games one creator may have waiting in the moderation queue at once.
 * Cheap backpressure against someone flooding the queue — one count query, no
 * rate-limiting infrastructure (Upstash is still deferred, see the plan).
 */

const SLUG_SUFFIX_LENGTH = 5;

/**
 * Title -> URL slug, always with a random suffix. The suffix (not a retry loop)
 * is what keeps `games.slug` unique: two creators can both make a "Coffee Quiz"
 * and neither publish fails.
 */
function toSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "game";
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SLUG_SUFFIX_LENGTH);
  return `${base}-${suffix}`;
}

const DESCRIPTIONS: Record<
  GameDraft["type"],
  (config: Record<string, unknown>) => string
> = {
  quiz: (c) =>
    `${(c.questions as unknown[])?.length ?? 0} questions. Answer fast for a speed bonus.`,
  memory: () => "Flip cards and match all six pairs before time runs out.",
  catch: () => "Drag to catch the falling items. Dodge the spiky ones.",
  reflex: () => "Tap the smiling orbs, avoid the spiky ones, chain combos.",
  merge: () => "Swipe or use arrow keys to merge matching tiles. Reach the top tier to win.",
  slide: () => "Slide the tiles into the gap to solve the puzzle before time runs out.",
  snake: () => "Eat the food to grow. Don't hit the wall or yourself.",
  tictactoe: () => "You're X against the computer. First to three in a row wins.",
};

export interface PublishedGame {
  id: string;
  slug: string;
  title: string;
}

/**
 * Creates a game from a wizard draft and puts it in the moderation queue.
 *
 * The draft arrives from the client, so it is re-normalized and re-validated
 * here with the same @playloop/games rules the wizard used — the wizard's copy
 * is for inline errors, this one is authoritative.
 *
 * Validation runs before the transaction (nothing is written yet), so a plain
 * throw is correct there; the transaction itself returns a discriminated result
 * and only throws after commit, per the convention in play/[slug]/actions.ts.
 */
export async function publishGame(
  draft: GameDraft,
  leagueId?: string | null,
): Promise<PublishedGame> {
  const { profile } = await requireProfile();
  const db = getDb();

  const type = draft?.type;
  if (!type || !(type in DESCRIPTIONS))
    throw new Error("Pick a template first.");

  const config = normalizeConfig(type, draft.config);
  const clean: GameDraft = {
    type,
    title: String(draft.title ?? "").trim(),
    theme: String(draft.theme ?? "neon"),
    difficulty: draft.difficulty,
    maxPoints: Number(draft.maxPoints),
    coverImage:
      draft.coverImage &&
      typeof draft.coverImage === "string" &&
      draft.coverImage.startsWith("data:image/")
        ? draft.coverImage
        : null,
    config,
  };

  const issues = validateGameDraft(clean);
  if (issues.length > 0)
    throw new Error(
      issues[0]?.message ?? "That game isn't ready to publish yet.",
    );

  const [pending] = await db
    .select({ n: count() })
    .from(schema.games)
    .where(
      and(
        eq(schema.games.creatorId, profile.id),
        eq(schema.games.status, "pending_review"),
      ),
    );
  if ((pending?.n ?? 0) >= PENDING_LIMIT) {
    throw new Error(
      `You already have ${PENDING_LIMIT} games waiting for review. Hold off until those are through.`,
    );
  }

  const outcome = await db.transaction(async (tx) => {
    const [game] = await tx
      .insert(schema.games)
      .values({
        slug: toSlug(clean.title),
        type: clean.type,
        title: clean.title,
        description: DESCRIPTIONS[clean.type](config),
        theme: clean.theme,
        difficulty: clean.difficulty,
        maxPoints: clean.maxPoints,
        coverImage: clean.coverImage,
        config,
        creatorId: profile.id,
        brandOriginal: false,
        leagueId: leagueId ?? null,
        status: "pending_review",
      })
      .returning({
        id: schema.games.id,
        slug: schema.games.slug,
        title: schema.games.title,
      });

    if (!game)
      return {
        ok: false as const,
        error: "Couldn't save that game — try again.",
      };

    await tx
      .insert(schema.moderationReviews)
      .values({ gameId: game.id, outcome: "pending" });
    return { ok: true as const, ...game };
  });

  if (!outcome.ok) throw new Error(outcome.error);
  const { ok: _ok, ...game } = outcome;

  revalidatePath("/create/games");
  return game;
}

/** Creator opt-in for brand sponsorship. Ownership is checked by the UPDATE itself, not a prior read. */
export async function toggleSponsorReady(
  gameId: string,
  next: boolean,
): Promise<{ sponsorReady: boolean }> {
  const { profile } = await requireProfile();
  const db = getDb();

  const [row] = await db
    .update(schema.games)
    .set({ sponsorReady: next })
    .where(
      and(eq(schema.games.id, gameId), eq(schema.games.creatorId, profile.id)),
    )
    .returning({ sponsorReady: schema.games.sponsorReady });

  if (!row) throw new Error("That game isn't yours to change.");

  // A template game's page lives at /create/games/[id]; a code game's at
  // /create/studio/[gameId] instead. Revalidating both is harmless for
  // whichever one this game isn't — Next.js no-ops a path that was never cached.
  revalidatePath(`/create/games/${gameId}`);
  revalidatePath(`/create/studio/${gameId}`);
  return row;
}

/**
 * Storing a game version: the one place a code game's code becomes an
 * immutable, playable-once-approved version. Used by AI generation jobs and by
 * forking a starter example, so every version is recorded the same way whatever
 * produced it.
 */
import { schema, type Tx } from "@playloop/db";
import { codeScoreTarget } from "@playloop/economy";
import type { LabReport } from "@playloop/replay";
import { fnv1a, RUNTIME_VERSION } from "@playloop/runtime";
import { and, eq, sql } from "drizzle-orm";

export interface NewVersion {
  code: string;
  /** The game lab's report for exactly this code, run in this build. */
  report: LabReport;
  title: string;
  summary: string;
  notes: string;
  via: "template" | "ai-create" | "ai-change" | "ai-fix" | "manual";
  request: string;
  promptVersion?: string | null;
  provider?: string | null;
  model?: string | null;
}

/** Title -> URL slug with a random suffix, the same scheme as template games. */
export function toSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "game";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Adds a version. With no `gameId`, first creates a new draft code game owned
 * by `creatorId` and makes this version 1. With a `gameId`, appends the next
 * version number and never touches an earlier version.
 *
 * On a draft the new version becomes current — the studio's working copy. On a
 * game that's submitted or live, current is left alone: what players get only
 * changes through review.
 *
 * The report must have loaded the game (report.meta set): a version needs its
 * meta to be played at all. Callers check that first.
 */
export async function addVersion(
  tx: Tx,
  input: {
    creatorId: string;
    gameId: string | null;
    version: NewVersion;
    settings?: { maxPoints?: number; theme?: string; coverImage?: string | null };
  },
): Promise<{ gameId: string; versionId: string; versionNumber: number }> {
  const { version } = input;
  const meta = version.report.meta;
  if (!meta) throw new Error("A version's game has to load before it can be stored.");

  let gameId = input.gameId;
  let versionNumber = 1;

  if (!gameId) {
    const [created] = await tx
      .insert(schema.games)
      .values({
        slug: toSlug(version.title),
        gameKind: "code",
        type: null,
        title: version.title,
        description: version.summary || meta.hint,
        theme: input.settings?.theme ?? "neon",
        maxPoints: input.settings?.maxPoints ?? 200,
        coverImage: input.settings?.coverImage ?? null,
        creatorId: input.creatorId,
        status: "draft",
      })
      .returning({ id: schema.games.id });
    gameId = created!.id;
  } else {
    const [latest] = await tx
      .select({ n: sql<number>`coalesce(max(${schema.gameVersions.versionNumber}), 0)`.mapWith(Number) })
      .from(schema.gameVersions)
      .where(eq(schema.gameVersions.gameId, gameId));
    versionNumber = (latest?.n ?? 0) + 1;
  }

  const [saved] = await tx
    .insert(schema.gameVersions)
    .values({
      gameId,
      versionNumber,
      via: version.via,
      request: version.request,
      code: version.code,
      contentHash: fnv1a(version.code),
      meta: meta as unknown as Record<string, unknown>,
      // The report was produced in this build, under this runtime.
      runtimeVersion: RUNTIME_VERSION,
      promptVersion: version.promptVersion ?? null,
      provider: version.provider ?? null,
      model: version.model ?? null,
      title: version.title,
      summary: version.summary,
      notes: version.notes,
      validation: version.report.verdict,
      report: version.report as unknown as Record<string, unknown>,
      // Economy calibration only; never decides validity.
      scoreTarget: codeScoreTarget(version.report.runs),
      status: "draft",
    })
    .returning({ id: schema.gameVersions.id });

  // current_version_id is DEFERRABLE, so a brand-new game can point at its first version here.
  await tx
    .update(schema.games)
    .set({ currentVersionId: saved!.id })
    .where(and(eq(schema.games.id, gameId), eq(schema.games.status, "draft")));

  return { gameId, versionId: saved!.id, versionNumber };
}

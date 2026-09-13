"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAdminAction } from "@/lib/adminLog";

const SLUG_SUFFIX_LENGTH = 5;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 300;

/** Name -> slug, always with a random suffix so the unique constraint can't collide. */
function toSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "brand";
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SLUG_SUFFIX_LENGTH);
  return `${base}-${suffix}`;
}

function revalidate() {
  revalidatePath("/admin/brands");
  revalidatePath("/admin/rewards");
}

/**
 * Creates a brand shell — a name/description/theme with nothing attached yet.
 * Rewards and campaigns are made separately once at least one person can act
 * for it, which is why this doesn't ask for a first member up front.
 */
export async function createBrand(input: { name: string; description: string; theme: string }): Promise<{ id: string }> {
  const { profile: admin } = await requireAdmin();

  const name = String(input?.name ?? "").trim().slice(0, NAME_MAX);
  if (!name) throw new Error("Give the brand a name.");
  const description = String(input?.description ?? "").trim().slice(0, DESCRIPTION_MAX);
  const theme = String(input?.theme ?? "neon");

  const db = getDb();
  const [created] = await db
    .insert(schema.brands)
    .values({ slug: toSlug(name), name, description, theme })
    .returning({ id: schema.brands.id });
  if (!created) throw new Error("Couldn't create that brand — try again.");

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "brand.create",
    targetType: "brand",
    targetId: created.id,
    summary: `Created brand "${name}"`,
  });

  revalidate();
  return { id: created.id };
}

/**
 * Grants an existing player account access to a brand's console. The person
 * has to have signed up already — this doesn't create a profile, it only
 * attaches brand_members to one that's there. profileId is unique on that
 * table (one brand per person, matching store_staff), so someone already
 * seated at another brand — or this one — gets a clear reason rather than a
 * raw constraint violation.
 */
export async function addBrandMember(brandId: string, email: string): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();

  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid email.");

  const db = getDb();

  const brand = await db
    .select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .where(eq(schema.brands.id, brandId))
    .then((r) => r[0]);
  if (!brand) throw new Error("That brand doesn't exist.");

  const profile = await db
    .select({ id: schema.profiles.id, email: schema.profiles.email })
    .from(schema.profiles)
    .where(eq(schema.profiles.email, normalized))
    .then((r) => r[0]);
  if (!profile) throw new Error("No player with that email has signed up yet.");

  const existingMembership = await db
    .select({ brandId: schema.brandMembers.brandId })
    .from(schema.brandMembers)
    .where(eq(schema.brandMembers.profileId, profile.id))
    .then((r) => r[0]);
  if (existingMembership) {
    throw new Error(
      existingMembership.brandId === brandId
        ? "That person is already a member of this brand."
        : "That person already belongs to a different brand.",
    );
  }

  await db.insert(schema.brandMembers).values({ brandId, profileId: profile.id });

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "brand.member_add",
    targetType: "brand",
    targetId: brandId,
    summary: `Added ${profile.email} to ${brand.name}`,
  });

  revalidate();
  return { ok: true };
}

/** Revokes a member's access to a brand's console. Their profile is untouched. */
export async function removeBrandMember(brandId: string, profileId: string): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();
  const db = getDb();

  const [removed] = await db
    .delete(schema.brandMembers)
    .where(and(eq(schema.brandMembers.brandId, brandId), eq(schema.brandMembers.profileId, profileId)))
    .returning({ profileId: schema.brandMembers.profileId });
  if (!removed) throw new Error("That person isn't a member of this brand.");

  const [brand, profile] = await Promise.all([
    db.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, brandId)).then((r) => r[0]),
    db.select({ email: schema.profiles.email }).from(schema.profiles).where(eq(schema.profiles.id, profileId)).then((r) => r[0]),
  ]);

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "brand.member_remove",
    targetType: "brand",
    targetId: brandId,
    summary: `Removed ${profile?.email ?? profileId} from ${brand?.name ?? "a brand"}`,
  });

  revalidate();
  return { ok: true };
}

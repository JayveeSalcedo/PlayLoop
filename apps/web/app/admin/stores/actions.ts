"use server";

import { getDb, schema } from "@playloop/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAdminAction } from "@/lib/adminLog";

const SLUG_SUFFIX_LENGTH = 5;
const NAME_MAX = 60;
const CITY_MAX = 60;

/** Name -> slug, always with a random suffix so the unique constraint can't collide. */
function toSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "store";
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SLUG_SUFFIX_LENGTH);
  return `${base}-${suffix}`;
}

function revalidate() {
  revalidatePath("/admin/stores");
}

export async function createStore(input: { brandId: string; name: string; city: string }): Promise<{ id: string }> {
  const { profile: admin } = await requireAdmin();

  const name = String(input?.name ?? "").trim().slice(0, NAME_MAX);
  if (!name) throw new Error("Give the store a name.");
  const city = String(input?.city ?? "").trim().slice(0, CITY_MAX);
  if (!city) throw new Error("Give the store a city.");

  const db = getDb();
  const brand = await db
    .select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .where(eq(schema.brands.id, String(input?.brandId ?? "")))
    .then((r) => r[0]);
  if (!brand) throw new Error("Pick a brand for this store.");

  const [created] = await db
    .insert(schema.stores)
    .values({ slug: toSlug(name), brandId: brand.id, name, city })
    .returning({ id: schema.stores.id });
  if (!created) throw new Error("Couldn't create that store — try again.");

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "store.create",
    targetType: "store",
    targetId: created.id,
    summary: `Created ${brand.name} store "${name}" in ${city}`,
  });

  revalidate();
  return { id: created.id };
}

/**
 * Deactivating a store shuts the scanner off for whoever works there —
 * requireStaff() 404s once store.active is false — without deleting the
 * store, its staff row, or the redemption history already recorded against
 * it.
 */
export async function setStoreActive(storeId: string, active: boolean): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();
  const db = getDb();

  const [row] = await db
    .update(schema.stores)
    .set({ active })
    .where(eq(schema.stores.id, storeId))
    .returning({ id: schema.stores.id, name: schema.stores.name });
  if (!row) throw new Error("That store doesn't exist.");

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: active ? "store.activate" : "store.deactivate",
    targetType: "store",
    targetId: storeId,
    summary: `${active ? "Reactivated" : "Deactivated"} "${row.name}"`,
  });

  revalidate();
  return { ok: true };
}

/**
 * Grants an existing player account the scanner at one store. Same shape as
 * addBrandMember: doesn't create a profile, and profileId is unique on
 * store_staff (one store per person), so someone already seated elsewhere
 * gets a clear reason rather than a raw constraint violation.
 */
export async function addStoreStaff(storeId: string, email: string): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();

  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid email.");

  const db = getDb();

  const store = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.id, storeId))
    .then((r) => r[0]);
  if (!store) throw new Error("That store doesn't exist.");

  const profile = await db
    .select({ id: schema.profiles.id, email: schema.profiles.email })
    .from(schema.profiles)
    .where(eq(schema.profiles.email, normalized))
    .then((r) => r[0]);
  if (!profile) throw new Error("No player with that email has signed up yet.");

  const existingMembership = await db
    .select({ storeId: schema.storeStaff.storeId })
    .from(schema.storeStaff)
    .where(eq(schema.storeStaff.profileId, profile.id))
    .then((r) => r[0]);
  if (existingMembership) {
    throw new Error(
      existingMembership.storeId === storeId
        ? "That person already works at this store."
        : "That person already works at a different store.",
    );
  }

  await db.insert(schema.storeStaff).values({ storeId, profileId: profile.id });

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "store.staff_add",
    targetType: "store",
    targetId: storeId,
    summary: `Added ${profile.email} to ${store.name}`,
  });

  revalidate();
  return { ok: true };
}

/** Revokes a staff member's access to a store's scanner. Their profile is untouched. */
export async function removeStoreStaff(storeId: string, profileId: string): Promise<{ ok: true }> {
  const { profile: admin } = await requireAdmin();
  const db = getDb();

  const [removed] = await db
    .delete(schema.storeStaff)
    .where(and(eq(schema.storeStaff.storeId, storeId), eq(schema.storeStaff.profileId, profileId)))
    .returning({ profileId: schema.storeStaff.profileId });
  if (!removed) throw new Error("That person isn't staff at this store.");

  const [store, profile] = await Promise.all([
    db.select({ name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.id, storeId)).then((r) => r[0]),
    db.select({ email: schema.profiles.email }).from(schema.profiles).where(eq(schema.profiles.id, profileId)).then((r) => r[0]),
  ]);

  await recordAdminAction(db, {
    actorProfileId: admin.id,
    action: "store.staff_remove",
    targetType: "store",
    targetId: storeId,
    summary: `Removed ${profile?.email ?? profileId} from ${store?.name ?? "a store"}`,
  });

  revalidate();
  return { ok: true };
}

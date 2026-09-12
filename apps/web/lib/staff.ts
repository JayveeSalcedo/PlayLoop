import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireProfile, type Profile } from "./profile";
import type { SessionPayload } from "./session";

export interface StaffStore {
  id: string;
  name: string;
  city: string;
  brandId: string;
  brandName: string;
}

export interface StaffContext {
  session: SessionPayload;
  profile: Profile;
  store: StaffStore;
}

/**
 * Like requireProfile(), but also requires the profile be store staff, and
 * hands back the store they work at.
 *
 * Unlike the admin gate (an ADMIN_EMAILS allowlist), membership lives in the
 * database: store staff are a brand's employees rather than us, so there's no
 * environment file to put them in. store_staff.profile_id is unique, so this
 * join returns at most one store and the scanner never has to ask which
 * counter it's standing at.
 *
 * notFound() rather than a redirect, matching /admin — a logged-in player
 * shouldn't be able to tell that /staff is a real route.
 */
export async function requireStaff(): Promise<StaffContext> {
  const { session, profile } = await requireProfile();
  const db = getDb();

  const store = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      city: schema.stores.city,
      brandId: schema.stores.brandId,
      brandName: schema.brands.name,
      active: schema.stores.active,
    })
    .from(schema.storeStaff)
    .innerJoin(schema.stores, eq(schema.storeStaff.storeId, schema.stores.id))
    .innerJoin(schema.brands, eq(schema.stores.brandId, schema.brands.id))
    .where(eq(schema.storeStaff.profileId, profile.id))
    .then((r) => r[0]);

  if (!store || !store.active) notFound();

  const { active: _active, ...rest } = store;
  return { session, profile, store: rest };
}

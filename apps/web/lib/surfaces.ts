import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "./admin";

export interface Surface {
  href: string;
  label: string;
  detail: string;
}

/**
 * The non-player surfaces a profile can actually reach.
 *
 * Every one of /admin, /staff and /brand was reachable only by typing its URL —
 * they were built and tested that way and never got a front door. This is that
 * door, and it's derived from the same membership rows and env allowlist the
 * gates themselves use, so it can't offer a link that 404s.
 *
 * One query for the two membership rows; the admin check is just the env var.
 */
export async function surfacesFor(profile: { id: string; email: string }): Promise<Surface[]> {
  const db = getDb();

  const [store, brand] = await Promise.all([
    db
      .select({ name: schema.stores.name, city: schema.stores.city })
      .from(schema.storeStaff)
      .innerJoin(schema.stores, eq(schema.storeStaff.storeId, schema.stores.id))
      .where(eq(schema.storeStaff.profileId, profile.id))
      .then((r) => r[0]),
    db
      .select({ name: schema.brands.name })
      .from(schema.brandMembers)
      .innerJoin(schema.brands, eq(schema.brandMembers.brandId, schema.brands.id))
      .where(eq(schema.brandMembers.profileId, profile.id))
      .then((r) => r[0]),
  ]);

  const surfaces: Surface[] = [];
  if (store) surfaces.push({ href: "/staff", label: "Store counter", detail: `${store.name}, ${store.city}` });
  if (brand) surfaces.push({ href: "/brand", label: "Brand console", detail: brand.name });
  if (isAdminEmail(profile.email)) surfaces.push({ href: "/admin", label: "Admin", detail: "Moderation and rewards" });

  return surfaces;
}

/**
 * Where to send someone after they sign in.
 *
 * Store staff and brand members signed in to work — a counter tablet opening on
 * a game feed every shift is just wrong. Admin deliberately does NOT redirect:
 * it's an email allowlist, so it's usually your own player account too, and
 * hijacking every login would be worse than one tap from the feed.
 */
export async function landingFor(profile: { id: string; email: string }): Promise<string> {
  const surfaces = await surfacesFor(profile);
  const work = surfaces.find((s) => s.href === "/staff" || s.href === "/brand");
  return work?.href ?? "/feed";
}

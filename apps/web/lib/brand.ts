import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireProfile, type Profile } from "./profile";
import type { SessionPayload } from "./session";

export interface MemberBrand {
  id: string;
  slug: string;
  name: string;
  description: string;
  theme: string;
}

export interface BrandContext {
  session: SessionPayload;
  profile: Profile;
  brand: MemberBrand;
}

/**
 * Like requireProfile(), but also requires the profile belong to a brand, and
 * hands back that brand.
 *
 * Membership is a brand_members row rather than an env allowlist, for the same
 * reason store staff are: brand people are a customer's employees, not ours.
 * profile_id is unique there, so this returns at most one brand and the console
 * never has to ask which brand you're acting for.
 *
 * notFound() rather than a redirect, matching /admin and /staff.
 */
export async function requireBrandMember(): Promise<BrandContext> {
  const { session, profile } = await requireProfile();
  const db = getDb();

  const brand = await db
    .select({
      id: schema.brands.id,
      slug: schema.brands.slug,
      name: schema.brands.name,
      description: schema.brands.description,
      theme: schema.brands.theme,
    })
    .from(schema.brandMembers)
    .innerJoin(schema.brands, eq(schema.brandMembers.brandId, schema.brands.id))
    .where(eq(schema.brandMembers.profileId, profile.id))
    .then((r) => r[0]);

  if (!brand) notFound();

  return { session, profile, brand };
}

import { getDb, schema } from "@playloop/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { BrandCard } from "./BrandCard";
import { NewBrandForm } from "./BrandForm";

export default async function AdminBrandsPage() {
  await requireAdmin();
  const db = getDb();

  const [brands, memberships] = await Promise.all([
    db
      .select({ id: schema.brands.id, name: schema.brands.name, description: schema.brands.description, theme: schema.brands.theme })
      .from(schema.brands)
      .orderBy(asc(schema.brands.name)),
    db
      .select({
        brandId: schema.brandMembers.brandId,
        profileId: schema.brandMembers.profileId,
        email: schema.profiles.email,
        name: schema.profiles.name,
      })
      .from(schema.brandMembers)
      .innerJoin(schema.profiles, eq(schema.brandMembers.profileId, schema.profiles.id)),
  ]);

  const membersByBrand = new Map<string, typeof memberships>();
  for (const m of memberships) {
    const list = membersByBrand.get(m.brandId) ?? [];
    list.push(m);
    membersByBrand.set(m.brandId, list);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Brands</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        Create a brand, then add the people who should be able to sign in and run its console at{" "}
        <code>/brand</code>. There&apos;s no self-serve signup for this — it&apos;s granted here.
      </p>

      <NewBrandForm />

      <div className="mt-8 flex flex-col gap-3">
        {brands.map((b) => (
          <BrandCard
            key={b.id}
            brand={{
              id: b.id,
              name: b.name,
              description: b.description,
              theme: b.theme,
              members: (membersByBrand.get(b.id) ?? []).map((m) => ({ profileId: m.profileId, email: m.email, name: m.name })),
            }}
          />
        ))}
        {brands.length === 0 ? <p className="text-sm font-bold text-soft">No brands yet.</p> : null}
      </div>
    </main>
  );
}

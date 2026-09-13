import { getDb, schema } from "@playloop/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { NewStoreForm } from "./StoreForm";
import { StoreCard } from "./StoreCard";

export default async function AdminStoresPage() {
  await requireAdmin();
  const db = getDb();

  const [brands, stores, staff] = await Promise.all([
    db
      .select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands)
      .orderBy(asc(schema.brands.name)),
    db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        city: schema.stores.city,
        active: schema.stores.active,
        brandName: schema.brands.name,
      })
      .from(schema.stores)
      .innerJoin(schema.brands, eq(schema.stores.brandId, schema.brands.id))
      .orderBy(asc(schema.stores.name)),
    db
      .select({
        storeId: schema.storeStaff.storeId,
        profileId: schema.storeStaff.profileId,
        email: schema.profiles.email,
        name: schema.profiles.name,
      })
      .from(schema.storeStaff)
      .innerJoin(schema.profiles, eq(schema.storeStaff.profileId, schema.profiles.id)),
  ]);

  const staffByStore = new Map<string, typeof staff>();
  for (const s of staff) {
    const list = staffByStore.get(s.storeId) ?? [];
    list.push(s);
    staffByStore.set(s.storeId, list);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Stores</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        Create a store, then add the people who should be able to work its scanner at <code>/staff</code>.
        There&apos;s no self-serve signup for this either — it&apos;s granted here.
      </p>

      <NewStoreForm brands={brands} />

      <div className="mt-8 flex flex-col gap-3">
        {stores.map((s) => (
          <StoreCard
            key={s.id}
            store={{
              id: s.id,
              name: s.name,
              city: s.city,
              brandName: s.brandName,
              active: s.active,
              staff: (staffByStore.get(s.id) ?? []).map((m) => ({ profileId: m.profileId, email: m.email, name: m.name })),
            }}
          />
        ))}
        {stores.length === 0 ? <p className="text-sm font-bold text-soft">No stores yet.</p> : null}
      </div>
    </main>
  );
}

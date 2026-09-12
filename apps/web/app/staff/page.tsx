import { getDb, schema } from "@playloop/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/staff";
import { UNDO_WINDOW_MINUTES } from "./constants";
import { ScannerPanel, UndoButton } from "./ScannerPanel";

export default async function StaffPage() {
  const { store } = await requireStaff();
  const db = getDb();

  // "Today" is the database's day, not the app server's — same reasoning as
  // every other time comparison here.
  const today = await db
    .select({
      id: schema.voucherRedemptions.id,
      redeemedAt: schema.voucherRedemptions.redeemedAt,
      reversedAt: schema.voucherRedemptions.reversedAt,
      code: schema.vouchers.code,
      rewardName: schema.rewards.name,
      undoable: sql<boolean>`
        ${schema.voucherRedemptions.reversedAt} is null
        and now() - ${schema.voucherRedemptions.redeemedAt} < interval '${sql.raw(String(UNDO_WINDOW_MINUTES))} minutes'
      `,
    })
    .from(schema.voucherRedemptions)
    .innerJoin(schema.vouchers, eq(schema.voucherRedemptions.voucherId, schema.vouchers.id))
    .innerJoin(schema.rewards, eq(schema.vouchers.rewardId, schema.rewards.id))
    .where(
      and(
        eq(schema.voucherRedemptions.storeId, store.id),
        sql`${schema.voucherRedemptions.redeemedAt} >= date_trunc('day', now())`,
      ),
    )
    .orderBy(desc(schema.voucherRedemptions.redeemedAt));

  const taken = today.filter((r) => r.reversedAt == null).length;

  return (
    <main className="mx-auto max-w-md p-6">
      <p className="text-xs font-extrabold text-soft">
        {store.brandName} · {store.city}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight">{store.name}</h1>

      <ScannerPanel />

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">
          Today{taken > 0 ? ` · ${taken} redeemed` : ""}
        </h2>
        {today.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-soft">Nothing redeemed here yet today.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {today.map((r) => (
              <li
                key={r.id}
                className={`rounded-2xl p-3 [border:var(--border-thick)] ${r.reversedAt ? "bg-paper" : "bg-card"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <p className={`font-extrabold ${r.reversedAt ? "text-soft line-through" : ""}`}>{r.rewardName}</p>
                    <p className="text-xs font-bold text-soft">
                      {r.code} ·{" "}
                      {r.redeemedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {r.reversedAt ? " · undone" : ""}
                    </p>
                  </div>
                  {r.undoable ? (
                    <div className="ml-auto shrink-0">
                      <UndoButton redemptionId={r.id} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

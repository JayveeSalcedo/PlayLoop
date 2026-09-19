import { getDb, schema } from "@playloop/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { BackToFeed } from "@/app/_components/BackToFeed";
import { SignOut } from "@/app/_components/SignOut";
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
    <main className="mx-auto max-w-lg p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold text-soft uppercase tracking-wider">
            {store.brandName} · {store.city}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">{store.name}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <BackToFeed />
          <SignOut className="btn sm" />
        </div>
      </div>

      {/* Today's KPI bar */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Redeemed Today</p>
          <p className="mt-1 text-3xl font-extrabold">{taken}</p>
        </div>
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Total Scanned</p>
          <p className="mt-1 text-3xl font-extrabold">{today.length}</p>
          <p className="mt-0.5 text-[10px] font-bold text-soft">
            {today.filter((r) => r.reversedAt != null).length} undone
          </p>
        </div>
      </div>

      <ScannerPanel />

      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-extrabold">Today&apos;s Activity</h2>
          {taken > 0 ? (
            <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-extrabold [border:var(--border-thick)]">
              {taken} redeemed
            </span>
          ) : null}
        </div>
        {today.length === 0 ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-ink/20 p-6 text-center">
            <p className="text-2xl">📋</p>
            <p className="mt-1 font-extrabold text-soft">Nothing redeemed yet today</p>
            <p className="text-xs font-bold text-soft">Scanned vouchers will appear here</p>
          </div>
        ) : (
          <ul className="fade-in mt-3 flex flex-col gap-2">
            {today.map((r) => (
              <li
                key={r.id}
                className={`card-hard rounded-2xl p-4 [border:var(--border-thick)] ${r.reversedAt ? "bg-paper" : "bg-card"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-extrabold ${r.reversedAt ? "text-soft line-through" : ""}`}>{r.rewardName}</p>
                    <p className="text-xs font-bold text-soft">
                      {r.code} ·{" "}
                      {r.redeemedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {r.reversedAt ? " · undone" : ""}
                    </p>
                  </div>
                  {r.undoable ? (
                    <div className="shrink-0">
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

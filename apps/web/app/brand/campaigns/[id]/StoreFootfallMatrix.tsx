export interface StoreVisitRow {
  storeId: string;
  storeName: string;
  city: string;
  visits: number;
}

/**
 * Breakdown of customer footfall and voucher redemptions by store branch.
 */
export function StoreFootfallMatrix({
  stores,
  totalVisits,
}: {
  stores: StoreVisitRow[];
  totalVisits: number;
}) {
  return (
    <section className="card-hard mt-6 rounded-2xl bg-card p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Store Footfall by Branch</h2>
          <p className="text-xs font-bold text-soft">Physical customer visits verified at store counters</p>
        </div>
        <span className="rounded-full bg-mint/30 px-2.5 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
          {totalVisits.toLocaleString("en-US")} total visits
        </span>
      </div>

      {stores.length === 0 ? (
        <p className="mt-4 rounded-xl border-2 border-dashed border-ink/20 p-4 text-center text-xs font-bold text-soft">
          No in-store redemptions recorded for this campaign yet.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border-2 border-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-[11px] font-extrabold uppercase tracking-wider text-soft [border-bottom:1.5px_solid_var(--ink)]">
              <tr>
                <th className="p-2.5">Branch</th>
                <th className="p-2.5">City</th>
                <th className="p-2.5 text-right">Visits</th>
                <th className="p-2.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 font-bold">
              {stores.map((s) => {
                const share = totalVisits > 0 ? Math.round((s.visits / totalVisits) * 100) : 0;
                return (
                  <tr key={s.storeId} className="hover:bg-paper/50">
                    <td className="p-2.5 text-ink">{s.storeName}</td>
                    <td className="p-2.5 text-xs text-soft">{s.city}</td>
                    <td className="p-2.5 text-right font-extrabold text-ink">
                      {s.visits.toLocaleString("en-US")}
                    </td>
                    <td className="p-2.5 text-right text-xs text-soft font-extrabold">
                      {share}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

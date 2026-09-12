import { tier, voucherStatus, xpNeed } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { count, desc, eq } from "drizzle-orm";
import { requireProfile } from "@/lib/profile";
import { voucherQrSvg } from "@/lib/qr";

/**
 * No streak card yet, on purpose. It needs day-boundary/timezone bookkeeping
 * plus streak-break forgiveness (the level-3 "Streak shield" perk in
 * @playloop/economy's PERKS implies logic that doesn't exist yet either).
 * When it's built, it needs no schema change: derive it from distinct
 * calendar dates with a completed play_sessions row for this profile,
 * counting consecutive days back from today/yesterday — no lastPlayedAt
 * column required. Naturally pairs with the Challenges phase, since the
 * brief pairs "streak at risk" push notifications with that engagement loop.
 */

export default async function WalletPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const [playedRow, voucherRows, ledgerRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.playSessions)
      .where(eq(schema.playSessions.profileId, profile.id))
      .then((r) => r[0]!.n),
    db
      .select({
        code: schema.vouchers.code,
        redeemedAt: schema.vouchers.redeemedAt,
        expiresAt: schema.vouchers.expiresAt,
        rewardName: schema.rewards.name,
        brandName: schema.brands.name,
      })
      .from(schema.vouchers)
      .innerJoin(schema.rewards, eq(schema.vouchers.rewardId, schema.rewards.id))
      .innerJoin(schema.brands, eq(schema.rewards.brandId, schema.brands.id))
      .where(eq(schema.vouchers.profileId, profile.id))
      .orderBy(desc(schema.vouchers.createdAt)),
    db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.profileId, profile.id))
      .orderBy(desc(schema.ledgerEntries.createdAt))
      .limit(20),
  ]);

  const need = xpNeed(profile.level);
  const vouchers = await Promise.all(
    voucherRows.map(async (v) => ({
      ...v,
      status: voucherStatus(v),
      qrSvg: voucherStatus(v) === "active" ? await voucherQrSvg(v.code) : null,
    })),
  );

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Wallet</h1>

      <div className="mt-4 rounded-3xl bg-violet p-5 text-white [border:var(--border-thick)]">
        <p className="text-sm font-bold opacity-90">Balance</p>
        <p className="text-5xl font-extrabold tracking-tight">{profile.pointsBalance.toLocaleString("en-US")}</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full border-2 border-white/60 bg-white/20">
          <div className="h-full bg-lemon" style={{ width: `${Math.min(100, (profile.xp / need) * 100)}%` }} />
        </div>
        <p className="mt-2 flex justify-between text-xs font-bold">
          <span>
            Level {profile.level}, {tier(profile.level)}
          </span>
          <span>{need - profile.xp} XP to next</span>
        </p>
      </div>

      <p className="mt-4 rounded-2xl bg-card p-3 text-center text-sm font-bold [border:var(--border-thick)]">
        {playedRow} game{playedRow === 1 ? "" : "s"} played
      </p>

      <h2 className="mt-6 text-sm font-extrabold text-soft">My vouchers</h2>
      {vouchers.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          No vouchers yet — redeem a reward to get one.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {vouchers.map((v, i) => (
            <div key={i} className="rounded-2xl bg-card p-3 [border:var(--border-thick)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-soft">{v.brandName}</p>
                  <b>{v.rewardName}</b>
                </div>
                <span
                  className={`rounded-lg border-2 border-ink px-2 py-0.5 text-xs font-extrabold ${
                    v.status === "active" ? "bg-mint" : "bg-paper text-soft"
                  }`}
                >
                  {v.status}
                </span>
              </div>
              {v.qrSvg ? (
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-20 w-20 shrink-0 rounded-lg bg-white p-1 [border:var(--border-thick)]" dangerouslySetInnerHTML={{ __html: v.qrSvg }} />
                  <p className="text-lg font-extrabold tracking-widest">{v.code}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm font-mono text-soft">{v.code}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-6 text-sm font-extrabold text-soft">History</h2>
      {ledgerRows.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          No points yet. Play a game to start earning.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]">
          {ledgerRows.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between border-b-2 border-ink/10 p-3 text-sm font-semibold last:border-b-0">
              <span>{tx.reason}</span>
              <b className={tx.delta >= 0 ? "text-[#0B8F63]" : "text-[#D81B5B]"}>
                {tx.delta >= 0 ? "+" : ""}
                {tx.delta.toLocaleString("en-US")}
              </b>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

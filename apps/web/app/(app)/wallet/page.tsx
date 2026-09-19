import { tier, voucherStatus, xpNeed } from "@playloop/economy";
import { getDb, schema } from "@playloop/db";
import { count, desc, eq } from "drizzle-orm";
import { SignOut } from "@/app/_components/SignOut";
import { SurfaceLinks } from "@/app/_components/SurfaceLinks";
import { requireProfile } from "@/lib/profile";
import { voucherQrSvg } from "@/lib/qr";
import { getStreak } from "@/lib/streak";
import { StreakCard } from "./StreakCard";
import { RotatingVoucher } from "./RotatingVoucher";
import { ProfileCard } from "./ProfileCard";
import { PerksModal } from "./PerksModal";

export default async function WalletPage() {
  const { profile } = await requireProfile();
  const db = getDb();

  const [playedRow, winsRow, voucherRows, ledgerRows, streakData] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.playSessions)
      .where(eq(schema.playSessions.profileId, profile.id))
      .then((r) => r[0]!.n),
    db
      .select({ n: count() })
      .from(schema.challenges)
      .where(eq(schema.challenges.winnerId, profile.id))
      .then((r) => r[0]!.n),
    db
      .select({
        id: schema.vouchers.id,
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
    getStreak(profile.id),
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

      {/* Profile Card & Editor */}
      <ProfileCard profile={profile} />

      {/* Balance card — prototype's .wcard */}
      <div className="mt-4 rounded-3xl bg-violet p-5 text-white [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <p className="text-sm font-bold opacity-90">Balance</p>
        <div className="mt-1 flex items-center gap-2.5">
          <span className="inline-block h-7 w-7 rounded-full bg-lemon [border:2.5px_solid_var(--ink)]" />
          <p className="text-5xl font-extrabold tracking-tight">
            {profile.pointsBalance.toLocaleString("en-US")}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full border-2 border-white/60 bg-white/20">
          <div className="h-full bg-lemon" style={{ width: `${Math.min(100, (profile.xp / need) * 100)}%` }} />
        </div>
        <p className="mt-2 flex justify-between text-xs font-bold">
          <span>
            Level {profile.level}, {tier(profile.level)}
          </span>
          <span>{need - profile.xp} XP to next</span>
        </p>
        <PerksModal currentLevel={profile.level} currentXp={profile.xp} />
      </div>

      {/* Stats row — prototype's .wstats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-3 text-center [border:var(--border-thick)]">
          <b className="text-xl font-extrabold">{playedRow}</b>
          <p className="text-[11px] font-bold text-soft">games played</p>
        </div>
        <div className="rounded-2xl bg-card p-3 text-center [border:var(--border-thick)]">
          <b className="text-xl font-extrabold">{winsRow}</b>
          <p className="text-[11px] font-bold text-soft">challenges won</p>
        </div>
        <div className="rounded-2xl bg-card p-3 text-center [border:var(--border-thick)]">
          <b className="text-xl font-extrabold">{0}</b>
          <p className="text-[11px] font-bold text-soft">friends invited</p>
        </div>
      </div>

      {/* Streak card */}
      <StreakCard streak={streakData.streak} playedToday={streakData.playedToday} />

      {/* Vouchers */}
      <h2 className="mt-6 text-sm font-extrabold text-soft">My vouchers</h2>
      {vouchers.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          No vouchers yet — redeem a reward to get one.
        </p>
      ) : (
        <div className="fade-in mt-2 flex flex-col gap-2">
          {vouchers.map((v) => (
            <div key={v.id} className="rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
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
              {v.status === "active" && v.qrSvg ? (
                <RotatingVoucher voucherId={v.id} initialQrSvg={v.qrSvg} code={v.code} />
              ) : (
                <p className="mt-1 font-mono text-sm text-soft">{v.code}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History — prototype's .txl */}
      <h2 className="mt-6 text-sm font-extrabold text-soft">History</h2>
      {ledgerRows.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-center text-sm text-soft">
          No points yet. Play a game to start earning.
        </p>
      ) : (
        <div className="fade-in mt-2 overflow-hidden rounded-2xl bg-card [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
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

      <SurfaceLinks profile={profile} />

      <div className="mt-8 flex justify-center">
        <SignOut className="btn sm" />
      </div>
    </main>
  );
}

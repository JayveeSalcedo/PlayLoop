import { getDb, schema } from "@playloop/db";
import { campaignStatus, formatAed } from "@playloop/economy";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { BackToFeed } from "@/app/_components/BackToFeed";
import { SignOut } from "@/app/_components/SignOut";
import { requireBrandMember } from "@/lib/brand";
import { getBrandVenueEvents } from "@/lib/eventsServer";
import type { EventRound } from "@/lib/events";
import { BrandArenaSection, type BrandVenueEventItem } from "./BrandArenaSection";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-paper text-soft",
  scheduled: "bg-lemon",
  live: "bg-mint",
  complete: "bg-card text-soft",
  cancelled: "bg-gum text-paper",
};

export default async function BrandPage() {
  const { brand } = await requireBrandMember();
  const db = getDb();

  const [campaigns, stores, brandTotals, rawVenueEvents] = await Promise.all([
    // All campaigns for this brand
    db
      .select({
        id: schema.campaigns.id,
        budgetFils: schema.campaigns.budgetFils,
        startsOn: schema.campaigns.startsOn,
        endsOn: schema.campaigns.endsOn,
        fundedAt: schema.campaigns.fundedAt,
        cancelledAt: schema.campaigns.cancelledAt,
        gameTitle: schema.games.title,
        rewardName: schema.rewards.name,
      })
      .from(schema.campaigns)
      .innerJoin(schema.games, eq(schema.campaigns.gameId, schema.games.id))
      .innerJoin(schema.rewards, eq(schema.campaigns.rewardId, schema.rewards.id))
      .where(eq(schema.campaigns.brandId, brand.id))
      .orderBy(desc(schema.campaigns.createdAt)),

    // Stores registered to this brand
    db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        city: schema.stores.city,
        active: schema.stores.active,
      })
      .from(schema.stores)
      .where(eq(schema.stores.brandId, brand.id))
      .orderBy(schema.stores.name),

    // Total in-store redemptions across all rewards of this brand
    db
      .select({
        visits: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.voucherRedemptions)
      .innerJoin(schema.vouchers, eq(schema.voucherRedemptions.voucherId, schema.vouchers.id))
      .innerJoin(schema.rewards, eq(schema.vouchers.rewardId, schema.rewards.id))
      .where(
        and(
          eq(schema.rewards.brandId, brand.id),
          isNull(schema.voucherRedemptions.reversedAt),
        ),
      )
      .then((r) => r[0] ?? { visits: 0 }),

    // Live arena activations for this brand
    getBrandVenueEvents(brand.id),
  ]);

  const venueEvents: BrandVenueEventItem[] = rawVenueEvents.map((evt) => {
    const rounds = (evt.rounds || []) as EventRound[];
    const roundGames = rounds.map((r) =>
      r.gameType === "reflex" ? "Reflex Matrix" : r.gameType === "catch" ? "Bean Catch" : "Speed Tap",
    );
    return {
      id: evt.id,
      code: evt.code,
      title: evt.title,
      venueName: evt.venueName,
      location: evt.location,
      sponsorName: evt.sponsorName,
      accentColor: evt.accentColor,
      prizePoolPoints: evt.prizePoolPoints,
      status: evt.status,
      roundsCount: rounds.length,
      roundGames,
    };
  });

  const activeCampaigns = campaigns.filter((c) => {
    const st = campaignStatus(c);
    return st === "live" || st === "scheduled";
  });

  const totalBudgetFils = campaigns.reduce((acc, c) => acc + c.budgetFils, 0);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold text-soft uppercase tracking-wider">Brand Console</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{brand.name}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <BackToFeed />
          <SignOut className="btn sm" />
        </div>
      </div>
      {brand.description ? <p className="mt-1 text-sm font-bold text-soft">{brand.description}</p> : null}

      {/* Brand-wide KPI Highlights */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Active Campaigns</p>
          <p className="mt-1 text-3xl font-extrabold">{activeCampaigns.length}</p>
          <p className="mt-0.5 text-[10px] font-bold text-soft">{campaigns.length} total</p>
        </div>
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Store Footfall</p>
          <p className="mt-1 text-3xl font-extrabold">{brandTotals.visits.toLocaleString("en-US")}</p>
          <p className="mt-0.5 text-[10px] font-bold text-soft">redemptions</p>
        </div>
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Branches</p>
          <p className="mt-1 text-3xl font-extrabold">{stores.length}</p>
          <p className="mt-0.5 text-[10px] font-bold text-soft">active locations</p>
        </div>
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <p className="text-xs font-extrabold text-soft">Total Committed</p>
          <p className="mt-1 text-3xl font-extrabold">{formatAed(totalBudgetFils)}</p>
          <p className="mt-0.5 text-[10px] font-bold text-soft">budget deployed</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">Campaigns</h2>
          {campaigns.length > 0 ? (
            <span className="rounded-full bg-card px-2 py-0.5 text-xs font-extrabold [border:var(--border-thick)]">
              {campaigns.length}
            </span>
          ) : null}
        </div>
        <Link href="/brand/new" className="btn go sm inline-flex">
          + New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-ink/20 p-6 text-center text-sm font-bold text-soft">
          No campaigns created yet. Launch your first sponsored game to start driving footfall!
        </p>
      ) : (
        <div className="fade-in mt-3 flex flex-col gap-3">
          {campaigns.map((c) => {
            const status = campaignStatus(c);
            return (
              <Link
                key={c.id}
                href={`/brand/campaigns/${c.id}`}
                className="card-hard card-hard-hover flex flex-col gap-2 rounded-2xl bg-card p-4 [border:var(--border-thick)] sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{c.gameTitle}</p>
                  <p className="text-xs font-bold text-soft">
                    {c.rewardName} · {formatAed(c.budgetFils)} · {c.startsOn} to {c.endsOn}
                  </p>
                </div>
                <span
                  className={`self-start shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold [border:var(--border-thick)] sm:self-center ${STATUS_STYLE[status]}`}
                >
                  {status}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Live Arena Activations for Big Screens */}
      <BrandArenaSection brandName={brand.name} events={venueEvents} />

      {/* Connected Physical Branches */}
      <div className="mt-8 flex items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">Store Branches</h2>
        {stores.length > 0 ? (
          <span className="rounded-full bg-card px-2 py-0.5 text-xs font-extrabold [border:var(--border-thick)]">
            {stores.length}
          </span>
        ) : null}
      </div>
      {stores.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-soft">No stores registered to this brand.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {stores.map((s) => (
            <div
              key={s.id}
              className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]"
            >
              <p className="text-sm font-extrabold text-ink truncate">{s.name}</p>
              <p className="text-xs font-bold text-soft">{s.city}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-mint"></span>
                <span className="text-[10px] font-extrabold text-soft">Counter Active</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

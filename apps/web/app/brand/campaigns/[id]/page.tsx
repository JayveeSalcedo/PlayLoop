import { getDb, schema } from "@playloop/db";
import { campaignStatus, costPer, formatAed } from "@playloop/economy";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandMember } from "@/lib/brand";
import { CancelButton } from "./CancelButton";
import { PlaysChart } from "./PlaysChart";
import { ConversionFunnel } from "./ConversionFunnel";
import { StoreFootfallMatrix, type StoreVisitRow } from "./StoreFootfallMatrix";
import { ActivityFeed, type ActivityEvent } from "./ActivityFeed";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { brand } = await requireBrandMember();
  const { id } = await params;
  const db = getDb();

  const campaign = await db
    .select({
      id: schema.campaigns.id,
      budgetFils: schema.campaigns.budgetFils,
      startsOn: schema.campaigns.startsOn,
      endsOn: schema.campaigns.endsOn,
      fundedAt: schema.campaigns.fundedAt,
      cancelledAt: schema.campaigns.cancelledAt,
      gameId: schema.campaigns.gameId,
      gameTitle: schema.games.title,
      rewardId: schema.campaigns.rewardId,
      rewardName: schema.rewards.name,
      poolTotal: schema.rewards.poolTotal,
      poolRemaining: schema.rewards.poolRemaining,
    })
    .from(schema.campaigns)
    .innerJoin(schema.games, eq(schema.campaigns.gameId, schema.games.id))
    .innerJoin(schema.rewards, eq(schema.campaigns.rewardId, schema.rewards.id))
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.brandId, brand.id)))
    .then((r) => r[0]);

  if (!campaign) notFound();

  const status = campaignStatus(campaign);

  // Every figure is scoped to this campaign's game and its inclusive date
  // window, both compared DB-side.
  const inWindow = sql`${schema.playSessions.startedAt} >= ${campaign.startsOn}::date
    AND ${schema.playSessions.startedAt} < (${campaign.endsOn}::date + interval '1 day')`;

  const [
    totals,
    firstTimers,
    visits,
    perDay,
    challengesCount,
    vouchersCount,
    storeBreakdown,
    recentPlays,
    recentRedemptions,
  ] = await Promise.all([
    // Plays and minutes
    db
      .select({
        plays: sql<number>`count(*)`.mapWith(Number),
        seconds: sql<number>`coalesce(sum(extract(epoch from (${schema.playSessions.completedAt} - ${schema.playSessions.startedAt}))), 0)`.mapWith(
          Number,
        ),
      })
      .from(schema.playSessions)
      .where(
        and(eq(schema.playSessions.gameId, campaign.gameId), eq(schema.playSessions.status, "completed"), inWindow),
      )
      .then((r) => r[0] ?? { plays: 0, seconds: 0 }),

    // New players whose first ever play was on this game in window
    db
      .execute(sql`
        SELECT count(*)::int AS n FROM (
          SELECT ps.profile_id,
                 min(ps.started_at) AS first_play,
                 (array_agg(ps.game_id ORDER BY ps.started_at))[1] AS first_game
          FROM play_sessions ps
          WHERE ps.status = 'completed'
          GROUP BY ps.profile_id
        ) f
        WHERE f.first_game = ${campaign.gameId}
          AND f.first_play >= ${campaign.startsOn}::date
          AND f.first_play < (${campaign.endsOn}::date + interval '1 day')
      `)
      .then((r) => Number((r as unknown as { n: number }[])[0]?.n ?? 0)),

    // Store visits
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.voucherRedemptions)
      .innerJoin(schema.vouchers, eq(schema.voucherRedemptions.voucherId, schema.vouchers.id))
      .where(
        and(
          eq(schema.vouchers.rewardId, campaign.rewardId),
          isNull(schema.voucherRedemptions.reversedAt),
          sql`${schema.voucherRedemptions.redeemedAt} >= ${campaign.startsOn}::date`,
          sql`${schema.voucherRedemptions.redeemedAt} < (${campaign.endsOn}::date + interval '1 day')`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),

    // Plays per day
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.playSessions.startedAt}), 'YYYY-MM-DD')`,
        plays: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.playSessions)
      .where(
        and(eq(schema.playSessions.gameId, campaign.gameId), eq(schema.playSessions.status, "completed"), inWindow),
      )
      .groupBy(sql`date_trunc('day', ${schema.playSessions.startedAt})`)
      .orderBy(sql`date_trunc('day', ${schema.playSessions.startedAt})`),

    // Viral challenges created from this game
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.challenges)
      .where(
        and(
          eq(schema.challenges.gameId, campaign.gameId),
          sql`${schema.challenges.createdAt} >= ${campaign.startsOn}::date`,
          sql`${schema.challenges.createdAt} < (${campaign.endsOn}::date + interval '1 day')`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),

    // Vouchers claimed for this reward
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.vouchers)
      .where(
        and(
          eq(schema.vouchers.rewardId, campaign.rewardId),
          sql`${schema.vouchers.createdAt} >= ${campaign.startsOn}::date`,
          sql`${schema.vouchers.createdAt} < (${campaign.endsOn}::date + interval '1 day')`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),

    // Store footfall breakdown by branch
    db
      .select({
        storeId: schema.stores.id,
        storeName: schema.stores.name,
        city: schema.stores.city,
        visits: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.voucherRedemptions)
      .innerJoin(schema.vouchers, eq(schema.voucherRedemptions.voucherId, schema.vouchers.id))
      .innerJoin(schema.stores, eq(schema.voucherRedemptions.storeId, schema.stores.id))
      .where(
        and(
          eq(schema.vouchers.rewardId, campaign.rewardId),
          isNull(schema.voucherRedemptions.reversedAt),
          sql`${schema.voucherRedemptions.redeemedAt} >= ${campaign.startsOn}::date`,
          sql`${schema.voucherRedemptions.redeemedAt} < (${campaign.endsOn}::date + interval '1 day')`,
        ),
      )
      .groupBy(schema.stores.id, schema.stores.name, schema.stores.city)
      .orderBy(sql`count(*) DESC`) as Promise<StoreVisitRow[]>,

    // Recent plays
    db
      .select({
        id: schema.playSessions.id,
        score: schema.playSessions.score,
        startedAt: schema.playSessions.startedAt,
        playerName: schema.profiles.name,
      })
      .from(schema.playSessions)
      .innerJoin(schema.profiles, eq(schema.playSessions.profileId, schema.profiles.id))
      .where(
        and(
          eq(schema.playSessions.gameId, campaign.gameId),
          eq(schema.playSessions.status, "completed"),
          inWindow,
        ),
      )
      .orderBy(desc(schema.playSessions.startedAt))
      .limit(5),

    // Recent in-store redemptions
    db
      .select({
        id: schema.voucherRedemptions.id,
        storeName: schema.stores.name,
        redeemedAt: schema.voucherRedemptions.redeemedAt,
      })
      .from(schema.voucherRedemptions)
      .innerJoin(schema.vouchers, eq(schema.voucherRedemptions.voucherId, schema.vouchers.id))
      .innerJoin(schema.stores, eq(schema.voucherRedemptions.storeId, schema.stores.id))
      .where(
        and(
          eq(schema.vouchers.rewardId, campaign.rewardId),
          isNull(schema.voucherRedemptions.reversedAt),
          sql`${schema.voucherRedemptions.redeemedAt} >= ${campaign.startsOn}::date`,
          sql`${schema.voucherRedemptions.redeemedAt} < (${campaign.endsOn}::date + interval '1 day')`,
        ),
      )
      .orderBy(desc(schema.voucherRedemptions.redeemedAt))
      .limit(5),
  ]);

  const minutes = Math.round(totals.seconds / 60);
  const perPlay = costPer(campaign.budgetFils, totals.plays);
  const perVisit = costPer(campaign.budgetFils, visits);
  const claimed = campaign.poolTotal != null ? campaign.poolTotal - (campaign.poolRemaining ?? 0) : null;

  // 7.2x Retail Felt Value multiplier from prototype
  const feltValueFils = Math.round(campaign.budgetFils * 7.2);
  const impressions = Math.round(totals.plays * 2.4);

  // Combine events into unified activity feed
  const activities: ActivityEvent[] = [
    ...recentPlays.map((p) => ({
      id: `play-${p.id}`,
      type: "play" as const,
      title: `${p.playerName ?? "A player"} scored ${p.score?.toLocaleString("en-US") ?? 0}`,
      detail: `Verified play on ${campaign.gameTitle}`,
      timeAgo: p.startedAt ? new Date(p.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "recent",
    })),
    ...recentRedemptions.map((r) => ({
      id: `red-${r.id}`,
      type: "redemption" as const,
      title: `Voucher redeemed at ${r.storeName}`,
      detail: `In-store claim for ${campaign.rewardName}`,
      timeAgo: r.redeemedAt ? new Date(r.redeemedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "recent",
    })),
  ];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/brand" className="text-sm font-extrabold underline">
        &larr; Back to brand console
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{campaign.gameTitle}</h1>
          <p className="mt-1 text-sm font-bold text-soft">
            {campaign.rewardName} · Budget: {formatAed(campaign.budgetFils)} · {campaign.startsOn} to {campaign.endsOn}
          </p>
        </div>
        <span className="rounded-full bg-card px-3 py-1 text-xs font-extrabold [border:var(--border-thick)]">
          {status}
        </span>
      </div>

      {status === "draft" ? (
        <p className="card-hard mt-6 rounded-2xl bg-card p-5 text-sm font-bold text-soft [border:var(--border-thick)]">
          Waiting on us to confirm your payment. Once funded, real-time analytics, attention metrics, and conversion funnels will appear here.
        </p>
      ) : (
        <>
          {/* Key attention & efficiency KPIs */}
          <div className="fade-in mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Total Plays" value={totals.plays.toLocaleString("en-US")} />
            <Stat label="Attention Minutes" value={minutes.toLocaleString("en-US")} />
            <Stat label="New Players" value={firstTimers.toLocaleString("en-US")} />
            <Stat label="Store Visits" value={visits.toLocaleString("en-US")} />
            <Stat label="Cost Per Play (CPP)" value={perPlay == null ? "—" : formatAed(perPlay)} />
            <Stat label="Cost Per Visit (CPV)" value={perVisit == null ? "—" : formatAed(perVisit)} />
          </div>

          {/* 7.2x Retail Felt Value Card */}
          <div className="card-hard mt-4 flex items-center justify-between rounded-2xl bg-lemon p-4 text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
            <div>
              <span className="rounded-md bg-ink px-2 py-0.5 text-[10px] font-extrabold text-lemon uppercase tracking-wider">
                7.2× Multiplier
              </span>
              <p className="mt-1 text-xs font-extrabold text-ink/80">Estimated Retail Felt Value Delivered</p>
            </div>
            <div className="text-right">
              <b className="text-2xl font-extrabold">{formatAed(feltValueFils)}</b>
              <p className="text-[11px] font-bold text-ink/70">From {formatAed(campaign.budgetFils)} budget</p>
            </div>
          </div>

          {/* Reward pool progress */}
          {campaign.poolTotal != null ? (
            <section className="card-hard mt-6 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
              <div className="flex items-baseline justify-between">
                <p className="font-extrabold">Reward pool</p>
                <p className="text-sm font-bold text-soft">
                  {claimed?.toLocaleString("en-US")} of {campaign.poolTotal.toLocaleString("en-US")} claimed
                </p>
              </div>
              <div className="mt-2 h-4 overflow-hidden rounded-full bg-paper [border:var(--border-thick)]">
                <div
                  className="h-full bg-mint"
                  style={{ width: `${Math.min(100, ((claimed ?? 0) / campaign.poolTotal) * 100)}%` }}
                />
              </div>
            </section>
          ) : null}

          {/* 5-Step Conversion Funnel */}
          <ConversionFunnel
            impressions={impressions}
            plays={totals.plays}
            challenges={challengesCount}
            vouchers={vouchersCount}
            visits={visits}
          />

          {/* Store Footfall Breakdown */}
          <StoreFootfallMatrix stores={storeBreakdown} totalVisits={visits} />

          {/* Plays Chart */}
          <section className="card-hard mt-6 rounded-2xl bg-card p-5 [border:var(--border-thick)]">
            <h2 className="text-lg font-extrabold tracking-tight">Plays per day</h2>
            {perDay.length === 0 ? (
              <p className="mt-2 text-sm font-bold text-soft">No plays in this window yet.</p>
            ) : (
              <div className="mt-4">
                <PlaysChart data={perDay} />
              </div>
            )}
          </section>

          {/* Live Activity Stream */}
          <ActivityFeed events={activities} />
        </>
      )}

      {status === "draft" || status === "scheduled" || status === "live" ? (
        <div className="mt-8">
          <CancelButton campaignId={campaign.id} />
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
      <p className="text-xs font-extrabold text-soft">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

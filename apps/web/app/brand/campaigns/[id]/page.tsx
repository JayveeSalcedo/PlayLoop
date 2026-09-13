import { getDb, schema } from "@playloop/db";
import { campaignStatus, costPer, formatAed } from "@playloop/economy";
import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandMember } from "@/lib/brand";
import { CancelButton } from "./CancelButton";
import { PlaysChart } from "./PlaysChart";

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
  // window, both compared DB-side. `endsOn + 1 day` because the stored bound is
  // a date and sessions carry a timestamp — a play at 23:00 on the last day is
  // inside the campaign.
  const inWindow = sql`${schema.playSessions.startedAt} >= ${campaign.startsOn}::date
    AND ${schema.playSessions.startedAt} < (${campaign.endsOn}::date + interval '1 day')`;

  const [totals, firstTimers, visits, perDay] = await Promise.all([
    // Plays and minutes in one pass over the same rows.
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

    // "New players" means players whose *first ever* completed play landed on
    // this game inside the window — not profiles created, which isn't
    // attributable to a campaign.
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

    // Store visits: vouchers for this campaign's reward actually accepted at a
    // counter and not since reversed.
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
  ]);

  const minutes = Math.round(totals.seconds / 60);
  const perPlay = costPer(campaign.budgetFils, totals.plays);
  const perVisit = costPer(campaign.budgetFils, visits);
  const claimed = campaign.poolTotal != null ? campaign.poolTotal - (campaign.poolRemaining ?? 0) : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/brand" className="text-sm font-extrabold underline">
        Back
      </Link>

      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{campaign.gameTitle}</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        {campaign.rewardName} · {formatAed(campaign.budgetFils)} · {campaign.startsOn} to {campaign.endsOn}
      </p>
      <p className="mt-2 inline-block rounded-full bg-card px-3 py-1 text-xs font-extrabold [border:var(--border-thick)]">
        {status}
      </p>

      {/* A draft shows no figures at all. The queries below would happily
          return numbers — plays on that game in that window exist whether or
          not anyone paid — but presenting them here would read as campaign
          results, and "cost per play: AED 5,000" against an unfunded budget is
          a number that means nothing. */}
      {status === "draft" ? (
        <p className="card-hard mt-4 rounded-2xl bg-card p-4 text-sm font-bold text-soft [border:var(--border-thick)]">
          Waiting on us to confirm your payment. Nothing is running and no numbers are counting yet.
        </p>
      ) : (
        <>
      <div className="fade-in mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Plays" value={totals.plays.toLocaleString("en-US")} />
        <Stat label="Minutes played" value={minutes.toLocaleString("en-US")} />
        <Stat label="New players" value={firstTimers.toLocaleString("en-US")} />
        <Stat label="Store visits" value={visits.toLocaleString("en-US")} />
        <Stat label="Cost per play" value={perPlay == null ? "—" : formatAed(perPlay)} />
        <Stat label="Cost per visit" value={perVisit == null ? "—" : formatAed(perVisit)} />
      </div>

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

      <section className="mt-6">
        <h2 className="text-xl font-extrabold">Plays per day</h2>
        {perDay.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-soft">No plays in this window yet.</p>
        ) : (
          <PlaysChart data={perDay} />
        )}
      </section>
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
    <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <p className="text-xs font-extrabold text-soft">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

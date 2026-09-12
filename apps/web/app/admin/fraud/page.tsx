import { getDb } from "@playloop/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

/** How far back the queue looks. Old rejections aren't interesting. */
const WINDOW_DAYS = 30;
/** Below this, rejections are almost certainly a flaky connection, not cheating. */
const MIN_REJECTIONS = 2;

interface Row {
  id: string;
  name: string | null;
  email: string;
  suspended: boolean;
  rejections: number;
  reasons: string | null;
  referrals: number;
  vouchers: number;
}

export default async function FraudPage() {
  await requireAdmin();
  const db = getDb();

  // Accounts, not events: a list of individual rejections is mostly one player
  // on a bad connection. Grouping is what makes a pattern visible.
  const rows = (await db.execute(sql`
    WITH rej AS (
      SELECT profile_id,
             count(*)::int AS rejections,
             string_agg(DISTINCT reject_reason, ', ') AS reasons
      FROM play_sessions
      WHERE status = 'rejected'
        AND started_at >= now() - (${WINDOW_DAYS} || ' days')::interval
      GROUP BY profile_id
      HAVING count(*) >= ${MIN_REJECTIONS}
    ),
    refs AS (
      SELECT c.sender_id AS profile_id, count(*)::int AS referrals
      FROM profiles p JOIN challenges c ON c.id = p.referred_by_challenge_id
      GROUP BY c.sender_id
    ),
    vou AS (
      SELECT profile_id, count(*)::int AS vouchers FROM vouchers GROUP BY profile_id
    )
    SELECT p.id, p.name, p.email,
           (p.suspended_at IS NOT NULL) AS suspended,
           coalesce(rej.rejections, 0) AS rejections,
           rej.reasons,
           coalesce(refs.referrals, 0) AS referrals,
           coalesce(vou.vouchers, 0) AS vouchers
    FROM profiles p
    LEFT JOIN rej  ON rej.profile_id  = p.id
    LEFT JOIN refs ON refs.profile_id = p.id
    LEFT JOIN vou  ON vou.profile_id  = p.id
    WHERE rej.profile_id IS NOT NULL
       OR refs.referrals >= 3
       OR p.suspended_at IS NOT NULL
    ORDER BY coalesce(rej.rejections, 0) DESC, coalesce(refs.referrals, 0) DESC
    LIMIT 100
  `)) as unknown as Row[];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Fraud review</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        Accounts with {MIN_REJECTIONS}+ rejected plays in the last {WINDOW_DAYS} days, three or more
        referrals, or an existing suspension.
      </p>

      <p className="mt-4 rounded-2xl bg-card p-4 text-sm font-bold text-soft [border:var(--border-thick)]">
        There is no IP address, device fingerprint or login log anywhere in this system, so the same
        person on several accounts isn&apos;t directly detectable. These are behavioural signals only —
        read them as a reason to look, not as proof.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 font-bold text-soft">Nothing to review.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/admin/fraud/${r.id}`}
              className="flex items-center gap-3 rounded-2xl bg-card p-4 [border:var(--border-thick)]"
            >
              <div className="min-w-0">
                <p className="truncate font-extrabold">{r.name ?? "(no name)"}</p>
                <p className="truncate text-xs font-bold text-soft">{r.email}</p>
                <p className="mt-1 text-xs font-bold text-soft">
                  {r.rejections} rejected{r.reasons ? ` (${r.reasons})` : ""} · {r.referrals} referred ·{" "}
                  {r.vouchers} vouchers
                </p>
              </div>
              {r.suspended ? (
                <span className="ml-auto shrink-0 rounded-full bg-gum px-2 py-1 text-xs font-extrabold text-paper [border:var(--border-thick)]">
                  suspended
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

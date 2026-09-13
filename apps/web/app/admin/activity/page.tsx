import { getDb, schema } from "@playloop/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";

export default async function AdminActivityPage() {
  await requireAdmin();
  const db = getDb();

  const entries = await db
    .select({
      id: schema.adminActions.id,
      action: schema.adminActions.action,
      summary: schema.adminActions.summary,
      details: schema.adminActions.details,
      createdAt: schema.adminActions.createdAt,
      actorName: schema.profiles.name,
      actorEmail: schema.profiles.email,
    })
    .from(schema.adminActions)
    .innerJoin(schema.profiles, eq(schema.adminActions.actorProfileId, schema.profiles.id))
    .orderBy(desc(schema.adminActions.createdAt))
    .limit(200);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm font-bold text-soft">
        Every admin action, newest first. Append-only — nothing here is edited or removed.
      </p>

      {entries.length === 0 ? (
        <p className="mt-6 font-bold text-soft">Nothing recorded yet.</p>
      ) : (
        <ul className="fade-in mt-6 flex flex-col gap-2">
          {entries.map((e) => {
            const reason = (e.details as { reason?: string; notes?: string })?.reason ?? (e.details as { notes?: string })?.notes;
            return (
              <li key={e.id} className="card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-extrabold">{e.summary}</p>
                  <p className="shrink-0 text-xs font-bold text-soft">
                    {e.createdAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <p className="mt-1 text-xs font-bold text-soft">
                  {e.actorName ?? e.actorEmail} · {e.action}
                </p>
                {reason ? <p className="mt-1 text-sm text-soft">&ldquo;{reason}&rdquo;</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

import { icon } from "@playloop/ui";

export interface ActivityEvent {
  id: string;
  type: "play" | "challenge" | "redemption";
  title: string;
  detail: string;
  timeAgo: string;
}

/**
 * Live campaign activity stream showing verified plays, challenges, and store redemptions.
 */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="card-hard mt-6 rounded-2xl bg-card p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Recent Activity</h2>
          <p className="text-xs font-bold text-soft">Live stream of verified player interactions</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-0.5 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
          <span className="inline-block h-2 w-2 rounded-full bg-ink animate-pulse" />
          Live
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border-2 border-dashed border-ink/20 p-4 text-center text-xs font-bold text-soft">
          No activity recorded yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {events.map((e) => {
            const iconName =
              e.type === "redemption"
                ? "gift"
                : e.type === "challenge"
                  ? "users"
                  : "play";
            const bgClass =
              e.type === "redemption"
                ? "bg-lemon"
                : e.type === "challenge"
                  ? "bg-gum"
                  : "bg-mint";

            return (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl bg-paper p-2.5 [border:1.5px_solid_var(--ink)]"
              >
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs [border:1.5px_solid_var(--ink)] ${bgClass}`}
                  dangerouslySetInnerHTML={{ __html: icon(iconName) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-ink truncate">{e.title}</p>
                  <p className="text-[11px] font-semibold text-soft truncate">{e.detail}</p>
                </div>
                <span className="text-[10px] font-bold text-soft whitespace-nowrap">
                  {e.timeAgo}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

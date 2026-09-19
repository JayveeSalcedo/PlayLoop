"use client";

interface FunnelStep {
  label: string;
  count: number;
  description: string;
}

/**
 * 5-stage visual conversion waterfall matching the prototype's .funnel
 * Shows how brand game attention converts directly into physical store visits.
 */
export function ConversionFunnel({
  impressions,
  plays,
  challenges,
  vouchers,
  visits,
}: {
  impressions: number;
  plays: number;
  challenges: number;
  vouchers: number;
  visits: number;
}) {
  const steps: FunnelStep[] = [
    { label: "Saw the game", count: impressions, description: "Feed views & challenge links" },
    { label: "Played", count: plays, description: "100% completed game sessions" },
    { label: "Challenged a friend", count: challenges, description: "Viral peer-to-peer shares" },
    { label: "Claimed a reward", count: vouchers, description: "Points exchanged for vouchers" },
    { label: "Visited a store", count: visits, description: "Verified in-store counter redemptions" },
  ];

  const maxCount = Math.max(impressions, 1);

  return (
    <section className="card-hard mt-6 rounded-2xl bg-card p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Conversion Funnel</h2>
          <p className="text-xs font-bold text-soft">From digital attention to physical store footfall</p>
        </div>
        <span className="rounded-full bg-lemon px-2.5 py-1 text-xs font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
          Full Journey
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {steps.map((step, idx) => {
          const pctOfTop = Math.min(100, (step.count / maxCount) * 100);
          const prevStep = idx > 0 ? steps[idx - 1] : null;
          const convRate = prevStep && prevStep.count > 0
            ? Math.round((step.count / prevStep.count) * 100)
            : null;

          return (
            <div key={step.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs font-bold">
                <span className="font-extrabold text-ink">
                  {step.label}
                  <span className="ml-1.5 font-normal text-soft hidden sm:inline">
                    ({step.description})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  {convRate != null && (
                    <span className="text-[11px] font-extrabold text-soft">
                      {convRate}% conv.
                    </span>
                  )}
                  <b className="text-sm font-extrabold text-ink">
                    {step.count.toLocaleString("en-US")}
                  </b>
                </div>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-paper [border:1.5px_solid_var(--ink)]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    idx === 4
                      ? "bg-mint"
                      : idx === 3
                        ? "bg-lemon"
                        : idx === 2
                          ? "bg-gum"
                          : "bg-violet"
                  }`}
                  style={{ width: `${Math.max(2, pctOfTop)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

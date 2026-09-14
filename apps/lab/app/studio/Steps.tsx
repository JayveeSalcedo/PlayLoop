import Link from "next/link";

export const STUDIO_STEPS = [
  { id: "idea", label: "Idea" },
  { id: "customise", label: "Customise" },
  { id: "test", label: "Test" },
  { id: "publish", label: "Publish" },
] as const;

export type StudioStep = (typeof STUDIO_STEPS)[number]["id"];

/** The numbered step pills from the creator flow. Steps after the first link only once there's a project. */
export function Steps({ current, projectId, done = [] }: { current: StudioStep; projectId?: string; done?: StudioStep[] }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Steps">
      {STUDIO_STEPS.map((step, i) => {
        const isCurrent = step.id === current;
        const isDone = done.includes(step.id);
        const href = step.id === "idea" ? "/studio" : projectId ? `/studio/${projectId}?step=${step.id}` : null;
        const pill = (
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold [border:var(--border-thick)] ${
              isCurrent ? "bg-ink text-paper" : isDone ? "bg-mint text-ink" : "bg-card text-ink"
            }`}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${isCurrent ? "bg-paper text-ink" : "bg-ink text-paper"}`}>
              {isDone && !isCurrent ? "✓" : i + 1}
            </span>
            {step.label}
          </span>
        );
        return (
          <li key={step.id}>
            {href && !isCurrent ? (
              <Link href={href} className="block rounded-full focus-visible:outline-3 focus-visible:outline-violet">
                {pill}
              </Link>
            ) : (
              pill
            )}
          </li>
        );
      })}
    </ol>
  );
}

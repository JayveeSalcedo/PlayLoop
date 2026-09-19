import { Skeleton } from "@/app/_components/Skeleton";

export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <div className="space-y-1.5 mb-6">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-60" />
      </div>

      {[1, 2].map((i) => (
        <section
          key={i}
          className="skeleton-card card-hard overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]"
        >
          <div className="flex gap-4 p-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl [border:var(--border-thick)] bg-black/5">
              <Skeleton className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
          <div className="border-t-2 border-ink/10 p-4 flex justify-between items-center">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-20 rounded-xl" />
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}

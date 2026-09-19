import { Skeleton } from "@/app/_components/Skeleton";

export default function StaffLoading() {
  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-9 w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] space-y-2"
          >
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] space-y-2"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    </main>
  );
}

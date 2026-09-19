import { Skeleton } from "@/app/_components/Skeleton";

export default function CreateLoading() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      {/* Stepper Pills Skeleton */}
      <div className="flex justify-between gap-1.5 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 flex-1 rounded-xl" />
        ))}
      </div>

      {/* AI Generate Box Skeleton */}
      <div className="skeleton-card card-hard p-5 rounded-3xl [border:var(--border-thick)] bg-card space-y-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <div className="flex justify-between items-center pt-2">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      {/* Template cards skeleton */}
      <div className="space-y-3 pt-2">
        <Skeleton className="h-5 w-40" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card space-y-2"
          >
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </main>
  );
}

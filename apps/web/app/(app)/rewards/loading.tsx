import { Skeleton } from "@/app/_components/Skeleton";

export default function RewardsLoading() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      {/* Header Points Balance Skeleton */}
      <div className="skeleton-card card-hard p-5 rounded-3xl [border:var(--border-thick)] bg-card">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-36" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* Rewards Grid Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card flex flex-col justify-between h-44"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-ink/10">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

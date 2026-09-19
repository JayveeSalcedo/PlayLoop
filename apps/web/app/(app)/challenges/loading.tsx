import { Skeleton } from "@/app/_components/Skeleton";

export default function ChallengesLoading() {
  return (
    <main className="mx-auto max-w-md p-6">
      {/* Top Tabs Skeleton */}
      <div className="flex rounded-2xl bg-paper p-1.5 [border:var(--border-thick)] mb-6">
        <div className="flex-1 py-2.5 rounded-xl skeleton h-10" />
        <div className="flex-1 py-2.5 rounded-xl skeleton h-10 ml-2" />
        <div className="flex-1 py-2.5 rounded-xl skeleton h-10 ml-2" />
      </div>

      {/* Season Pass Hero Skeleton */}
      <div className="skeleton-card card-hard mb-6 p-5 rounded-3xl [border:var(--border-thick)] bg-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-44 mb-3" />
        <Skeleton className="h-3 w-full rounded-full mb-3" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Leaderboard / List Rows Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 mb-2" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard flex items-center gap-3 p-4 rounded-2xl bg-card [border:var(--border-thick)]"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-14 rounded-lg" />
          </div>
        ))}
      </div>
    </main>
  );
}

import { Skeleton } from "@/app/_components/Skeleton";

export default function CommunityLoading() {
  return (
    <main className="mx-auto max-w-md p-4 pb-28 space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full rounded-2xl" />

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard flex items-center gap-3 p-4 rounded-2xl [border:var(--border-thick)] bg-card"
          >
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <div className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard flex items-center gap-3 p-4 rounded-2xl [border:var(--border-thick)] bg-card"
          >
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-8 w-16 rounded-xl" />
          </div>
        ))}
      </div>
    </main>
  );
}

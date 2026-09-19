import { Skeleton } from "@/app/_components/Skeleton";

export default function StudioLoading() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      {/* Back link */}
      <Skeleton className="h-4 w-20 mb-2" />

      {/* 16:9 Cover Banner Skeleton */}
      <div className="skeleton-card card-hard overflow-hidden rounded-2xl [border:var(--border-thick)] aspect-[16/9]">
        <Skeleton className="h-full w-full" />
      </div>

      {/* Title & Status */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>

      {/* Version Card Skeleton */}
      <div className="skeleton-card card-hard p-5 rounded-3xl [border:var(--border-thick)] bg-card space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      </div>

      {/* Settings Card Skeleton */}
      <div className="skeleton-card card-hard p-5 rounded-2xl [border:var(--border-thick)] bg-card space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </main>
  );
}

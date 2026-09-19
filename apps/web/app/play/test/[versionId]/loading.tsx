import { Skeleton } from "@/app/_components/Skeleton";

export default function TestPlayLoading() {
  return (
    <main className="mx-auto max-w-sm p-6 space-y-4">
      {/* 16:9 Cover Banner Skeleton */}
      <div className="skeleton-card card-hard overflow-hidden rounded-3xl [border:var(--border-thick)] aspect-[16/9]">
        <Skeleton className="h-full w-full" />
      </div>

      {/* Title & Stats Skeleton */}
      <Skeleton className="h-9 w-3/4 mt-4" />
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-4 w-full mt-2" />
      <Skeleton className="h-4 w-2/3" />

      {/* Button Skeleton */}
      <div className="pt-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </main>
  );
}

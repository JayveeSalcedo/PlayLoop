import { Skeleton, SkeletonGameGrid, SkeletonHeroCard } from "@/app/_components/Skeleton";

export default function FeedLoading() {
  return (
    <main className="mx-auto max-w-md p-6">
      {/* Spotlight Card Skeleton */}
      <SkeletonHeroCard />

      {/* Heading */}
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* All Games Grid Skeleton */}
      <SkeletonGameGrid count={4} />
    </main>
  );
}

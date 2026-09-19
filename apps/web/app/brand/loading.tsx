import { Skeleton } from "@/app/_components/Skeleton";

export default function BrandLoading() {
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Brand Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card space-y-2"
          >
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Funnel & Analytics Section */}
      <div className="skeleton-card card-hard p-6 rounded-3xl [border:var(--border-thick)] bg-card space-y-4">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>

      {/* Arena Activations Section */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-44" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard p-5 rounded-2xl [border:var(--border-thick)] bg-card space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </main>
  );
}

import { Skeleton } from "@/app/_components/Skeleton";

export default function WalletLoading() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      {/* Profile / OnePass Card Skeleton */}
      <div className="skeleton-card card-hard p-5 rounded-3xl [border:var(--border-thick)] bg-card space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="pt-2 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-3.5 w-full rounded-full" />
        </div>
      </div>

      {/* Streak Card Skeleton */}
      <div className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-36" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* Vouchers Section Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="skeleton-card card-hard p-4 rounded-2xl [border:var(--border-thick)] bg-card flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>

      {/* Ledger Entries Skeleton */}
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-36" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-xl bg-card [border:var(--border-thick)]"
          >
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    </main>
  );
}

import { Skeleton } from "@/app/_components/Skeleton";

export default function MyGamesLoading() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Skeleton className="h-9 w-40 mb-6" />

      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton-card card-hard flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-3 [border:var(--border-thick)]"
          >
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl [border:var(--border-thick)] bg-black/5">
              <Skeleton className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}

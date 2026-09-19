import { Skeleton } from "@/app/_components/Skeleton";

export default function EventJoinLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0722] p-4 text-white">
      <div className="w-full max-w-sm rounded-3xl border-4 border-white/20 bg-white/5 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-28 bg-white/10" />
          <Skeleton className="h-5 w-20 rounded-full bg-white/10" />
        </div>
        <Skeleton className="h-8 w-48 bg-white/10" />
        <Skeleton className="h-16 w-full rounded-2xl bg-white/10" />
        <Skeleton className="h-12 w-full rounded-2xl bg-white/10" />
      </div>
    </div>
  );
}

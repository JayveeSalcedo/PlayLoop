import { Skeleton } from "@/app/_components/Skeleton";

export default function EventsLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0722] p-6 text-white">
      {/* 16:9 Arena Display Skeleton */}
      <div className="w-full max-w-4xl aspect-[16/9] rounded-3xl border-4 border-white/20 bg-white/5 p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-44 bg-white/10" />
          <Skeleton className="h-6 w-32 rounded-full bg-white/10" />
        </div>

        <div className="flex items-center justify-center gap-8 my-auto">
          <Skeleton className="h-44 w-44 rounded-2xl bg-white/10" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-64 bg-white/10" />
            <Skeleton className="h-5 w-48 bg-white/10" />
            <Skeleton className="h-12 w-52 rounded-xl bg-white/10" />
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-white/10 pt-4">
          <Skeleton className="h-5 w-36 bg-white/10" />
          <Skeleton className="h-5 w-28 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

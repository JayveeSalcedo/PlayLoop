import { Skeleton } from "@/app/_components/Skeleton";

export default function CommunityChatLoading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-5 w-32" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
          <Skeleton className="h-10 w-2/3 rounded-2xl" />
        </div>
      ))}
      <Skeleton className="mt-auto h-12 w-full rounded-xl" />
    </div>
  );
}

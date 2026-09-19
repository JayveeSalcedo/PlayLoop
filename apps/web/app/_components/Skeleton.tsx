import React from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonText({
  lines = 2,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`skeleton h-3.5 ${i === lines - 1 && lines > 1 ? "w-3/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonHeroCard() {
  return (
    <div className="skeleton-card card-hard mb-6 overflow-hidden rounded-2xl [border:var(--border-thick)]">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/5">
        <div className="skeleton h-full w-full" />
        <div className="absolute top-3 left-3 h-6 w-32 rounded-full skeleton" />
        <div className="absolute bottom-3 right-3 h-6 w-24 rounded-full skeleton" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1 max-w-xs">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-6 w-48" />
          </div>
          <div className="skeleton h-10 w-24 rounded-xl" />
        </div>
        <div className="mt-3 skeleton h-4 w-5/6" />
      </div>
    </div>
  );
}

export function SkeletonGameGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton-card card-hard overflow-hidden rounded-2xl bg-card [border:var(--border-thick)]"
        >
          <div className="aspect-[4/3] overflow-hidden bg-paper">
            <div className="skeleton h-full w-full" />
          </div>
          <div className="p-3 space-y-2">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

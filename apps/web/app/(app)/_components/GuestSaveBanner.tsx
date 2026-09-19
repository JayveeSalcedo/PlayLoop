import Link from "next/link";
import { icon } from "@playloop/ui";

/**
 * Sticky banner reminding guest accounts to save their progress
 * to OnePass before points or vouchers expire.
 */
export function GuestSaveBanner({ isGuest }: { isGuest: boolean }) {
  if (!isGuest) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-lemon px-4 py-2 text-xs font-extrabold text-ink">
      <div className="flex items-center gap-1.5 truncate">
        <span
          className="flex-shrink-0 text-sm"
          dangerouslySetInnerHTML={{ __html: icon("spark") }}
        />
        <span className="truncate">
          Playing as guest. Save progress to keep your points.
        </span>
      </div>
      <Link
        href="/login"
        className="flex-shrink-0 rounded-lg bg-ink px-2.5 py-1 text-[11px] font-extrabold text-white transition-opacity hover:opacity-90"
      >
        Save to OnePass
      </Link>
    </div>
  );
}

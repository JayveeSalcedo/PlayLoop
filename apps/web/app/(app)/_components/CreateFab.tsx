"use client";

import Link from "next/link";
import { icon } from "@playloop/ui";

/**
 * Floating "Create" button — reuses the fixed bottom-24 right-4 FAB slot
 * freed up when ArenaScanButton moved from a global FAB into the Community
 * tab (see CommunityListClient.tsx).
 */
export function CreateFab() {
  return (
    <Link
      href="/create"
      className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-lemon text-ink [border:var(--border-thick)] [box-shadow:var(--shadow-sm)] transition-transform active:scale-90"
      aria-label="Create a game"
    >
      <span dangerouslySetInnerHTML={{ __html: icon("plus") }} className="text-2xl" />
    </Link>
  );
}

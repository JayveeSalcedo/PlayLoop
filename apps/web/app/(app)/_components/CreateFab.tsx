"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icon } from "@playloop/ui";

/**
 * Floating "Create" button — reuses the fixed bottom-24 right-4 FAB slot
 * freed up when ArenaScanButton moved from a global FAB into the Community
 * tab (see CommunityListClient.tsx).
 */
export function CreateFab() {
  const pathname = usePathname();
  // A group chat's own message composer (the Send button) sits in this same
  // bottom-right corner at phone widths — the FAB would float on top of it
  // and block taps. The community list and a group's info page don't have
  // that composer, so the FAB stays there.
  const inGroupChat = /^\/community\/[^/]+$/.test(pathname);
  if (inGroupChat) return null;

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

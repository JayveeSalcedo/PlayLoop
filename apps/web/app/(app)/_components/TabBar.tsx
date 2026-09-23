"use client";

import { icon, type IconName } from "@playloop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
  { href: "/community", label: "Community", icon: "msg" },
  { href: "/challenges", label: "Compete", icon: "users" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
];

export function TabBar({
  communityUnread = false,
  communityIds = [],
  viewerProfileId,
}: {
  /** Server-computed truth as of this page load — the seed for the client-side flag below. */
  communityUnread?: boolean;
  /** The viewer's own joined groups, to scope the Realtime filter below. */
  communityIds?: string[];
  viewerProfileId?: string;
}) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  // Seeded from the server on every navigation (a fresh layout render always
  // reflects true read-state); Realtime only ever flips it further true in
  // between navigations, for a message that lands while sitting on some
  // other tab entirely.
  const [prevCommunityUnread, setPrevCommunityUnread] = useState(communityUnread);
  const [liveUnread, setLiveUnread] = useState(communityUnread);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingTab(null);
  }
  if (communityUnread !== prevCommunityUnread) {
    setPrevCommunityUnread(communityUnread);
    setLiveUnread(communityUnread);
  }

  useEffect(() => {
    if (communityIds.length === 0 || !viewerProfileId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — the dot still updates on the next navigation.

    const channel = supabase
      .channel(`tabbar-community-unread-${viewerProfileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `community_id=in.(${communityIds.join(",")})` },
        (payload) => {
          const row = payload.new as { sender_id: string };
          if (row.sender_id !== viewerProfileId) setLiveUnread(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // communityIds is derived fresh each render from a server-fetched array — comparing its
    // contents (not identity) would need a join/sort key, so just key off its length + the
    // profile, matching the community_messages.INSERT scoped-by-ids pattern used elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityIds.length, viewerProfileId]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-sm items-center justify-around bg-card py-2 [border-top:var(--border-thick)]"
      aria-label="Main"
    >
      {TABS.map((t) => {
        const activePath = pendingTab ?? pathname;
        const on = activePath === t.href || activePath.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={() => setPendingTab(t.href)}
            className={`flex flex-col items-center gap-1 px-2 py-1 text-[11px] font-bold transition-transform active:scale-95 ${
              on ? "text-ink font-extrabold" : "text-faint hover:text-ink"
            }`}
          >
            <span className="relative">
              <span dangerouslySetInnerHTML={{ __html: icon(t.icon) }} className="text-xl" />
              {t.href === "/community" && liveUnread && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gum [border:1.5px_solid_var(--color-card)]" />
              )}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

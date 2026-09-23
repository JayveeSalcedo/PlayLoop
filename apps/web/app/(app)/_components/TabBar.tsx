"use client";

import { icon, type IconName } from "@playloop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
  { href: "/community", label: "Community", icon: "msg" },
  { href: "/challenges", label: "Compete", icon: "users" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
];

export function TabBar({ communityUnread = false }: { communityUnread?: boolean }) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingTab(null);
  }

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
              {t.href === "/community" && communityUnread && (
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

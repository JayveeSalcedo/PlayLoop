"use client";

import { icon, type IconName } from "@playloop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
  { href: "/challenges", label: "Challenges", icon: "users" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-sm items-center justify-around bg-card py-2 [border-top:var(--border-thick)]"
      aria-label="Main"
    >
      {TABS.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center gap-1 px-4 py-1 text-xs font-bold ${on ? "text-ink" : "text-faint"}`}
          >
            <span dangerouslySetInnerHTML={{ __html: icon(t.icon) }} className="text-xl" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";
import { BackToFeed } from "@/app/_components/BackToFeed";
import { SignOut } from "@/app/_components/SignOut";
import { requireAdmin } from "@/lib/admin";

const TABS = [
  { href: "/admin", label: "Moderation" },
  { href: "/admin/fraud", label: "Fraud" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/stores", label: "Stores" },
  { href: "/admin/activity", label: "Activity" },
];

/**
 * Gates the whole /admin tree, so a new sub-route can't be added without the
 * check. Each page calls requireAdmin() too — a layout is not a security
 * boundary on its own, since a page can render without its layout in some
 * Next.js flows.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <nav className="sticky top-0 z-20 border-b-2 border-ink/10 bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="shrink-0 rounded-full bg-paper px-3 py-1 text-xs font-extrabold [border:var(--border-thick)] transition-transform hover:scale-[1.04] active:scale-95 sm:text-sm"
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex shrink-0 gap-2">
            <BackToFeed />
            <SignOut className="btn sm" />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}

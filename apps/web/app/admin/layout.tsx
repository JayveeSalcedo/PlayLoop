import Link from "next/link";
import { SignOut } from "@/app/_components/SignOut";
import { requireAdmin } from "@/lib/admin";

const TABS = [
  { href: "/admin", label: "Moderation" },
  { href: "/admin/fraud", label: "Fraud" },
  { href: "/admin/rewards", label: "Rewards" },
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
      <nav className="border-b-2 border-ink/10 bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-2 p-3">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-full bg-paper px-3 py-1 text-sm font-extrabold [border:var(--border-thick)]"
            >
              {t.label}
            </Link>
          ))}
          <div className="ml-auto">
            <SignOut className="btn sm" />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}

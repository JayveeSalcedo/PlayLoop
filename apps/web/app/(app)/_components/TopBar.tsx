import Link from "next/link";
import { InstallPrompt } from "@/app/_components/pwa/InstallPrompt";
import { requireProfile } from "@/lib/profile";
import { surfacesFor } from "@/lib/surfaces";
import { GuestSaveBanner } from "./GuestSaveBanner";

/**
 * Persistent header above the tab bar on every tabbed screen. Shows the
 * playloop wordmark, role shortcuts (Admin, Brand, Staff), install CTA,
 * points-balance pill linking to /wallet, and guest save reminder banner.
 */
export async function TopBar() {
  const { profile } = await requireProfile();
  const surfaces = await surfacesFor(profile);

  return (
    <div className="sticky top-0 z-30">
      <header className="flex items-center justify-between gap-2 bg-paper px-4 py-2 [border-bottom:var(--border-thick)]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-extrabold tracking-tight">playloop</span>
          {surfaces.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="shrink-0 rounded-full bg-mint/30 hover:bg-mint px-2 py-0.5 text-[11px] font-extrabold text-ink transition-colors [border:1.5px_solid_var(--ink)]"
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <InstallPrompt />
          <a
            href="/wallet"
            className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[13px] font-extrabold [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
          >
            <span className="coin sm" aria-hidden="true" />
            {profile.pointsBalance.toLocaleString("en-US")}
          </a>
        </div>
      </header>
      <GuestSaveBanner isGuest={profile.isGuest} />
    </div>
  );
}

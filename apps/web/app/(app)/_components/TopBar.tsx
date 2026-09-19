import { InstallPrompt } from "@/app/_components/pwa/InstallPrompt";
import { requireProfile } from "@/lib/profile";
import { GuestSaveBanner } from "./GuestSaveBanner";

/**
 * Persistent header above the tab bar on every tabbed screen. Shows the
 * playloop wordmark, install CTA, points-balance pill linking to
 * /wallet, and guest save reminder banner when applicable.
 */
export async function TopBar() {
  const { profile } = await requireProfile();

  return (
    <div className="sticky top-0 z-30">
      <header className="flex items-center justify-between bg-paper px-4 py-2 [border-bottom:var(--border-thick)]">
        <span className="text-sm font-extrabold tracking-tight">playloop</span>
        <div className="flex items-center gap-2">
          <InstallPrompt />
          <a
            href="/wallet"
            className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[13px] font-extrabold [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
          >
            <span className="inline-block h-[18px] w-[18px] rounded-full bg-lemon [border:2px_solid_var(--ink)]" />
            {profile.pointsBalance.toLocaleString("en-US")}
          </a>
        </div>
      </header>
      <GuestSaveBanner isGuest={profile.isGuest} />
    </div>
  );
}

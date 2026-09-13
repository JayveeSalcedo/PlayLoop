import { InstallPrompt } from "@/app/_components/pwa/InstallPrompt";

/**
 * Persistent header above the tab bar on every tabbed screen. Its only job
 * today is the "Add to home screen" CTA — InstallPrompt itself renders
 * nothing once the app's already installed or on a browser that can't
 * install it, so this bar is deliberately minimal rather than duplicating
 * per-page headers (feed/wallet already show their own identity/points).
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-paper px-4 py-2 [border-bottom:var(--border-thick)]">
      <span className="text-sm font-extrabold tracking-tight">playloop</span>
      <InstallPrompt />
    </header>
  );
}

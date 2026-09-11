import { TabBar } from "./_components/TabBar";

/**
 * Shared chrome for the tabbed screens (feed/wallet/rewards). A route group
 * — `(app)` — doesn't change the URL, so /feed, /wallet, /rewards are
 * unaffected by living under this folder. /play/[slug] and /onboarding stay
 * outside it deliberately: fullscreen/setup flows with no shared tabbar,
 * matching the prototype's `.app.notabs` screens.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-24">
      {children}
      <TabBar />
    </div>
  );
}

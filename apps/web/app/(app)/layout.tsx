import { TabBar } from "./_components/TabBar";
import { TopBar } from "./_components/TopBar";
import { CreateFab } from "./_components/CreateFab";
import { requireProfile } from "@/lib/profile";
import { getCommunityIdsForProfile, hasAnyUnreadCommunity } from "@/lib/communities";

/**
 * Shared chrome for the tabbed screens (feed/wallet/rewards). A route group
 * — `(app)` — doesn't change the URL, so /feed, /wallet, /rewards are
 * unaffected by living under this folder. /play/[slug] and /onboarding stay
 * outside it deliberately: fullscreen/setup flows with no shared tabbar,
 * matching the prototype's `.app.notabs` screens.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const [communityUnread, communityIds] = await Promise.all([
    hasAnyUnreadCommunity(profile.id),
    getCommunityIdsForProfile(profile.id),
  ]);

  return (
    <div className="pb-24">
      <TopBar />
      {children}
      <CreateFab />
      <TabBar communityUnread={communityUnread} communityIds={communityIds} viewerProfileId={profile.id} />
    </div>
  );
}

import { requireProfile } from "@/lib/profile";
import { getCommunitiesForProfile, listPublicCommunities } from "@/lib/communities";
import { CommunityListClient } from "./CommunityListClient";

export default async function CommunityPage() {
  const { profile } = await requireProfile();

  const [joined, discover] = await Promise.all([
    getCommunitiesForProfile(profile.id),
    listPublicCommunities(profile.id),
  ]);

  const joinedIds = new Set(joined.map((c) => c.id));
  const open = discover.filter((c) => !joinedIds.has(c.id));

  return <CommunityListClient joined={joined} open={open} viewerProfileId={profile.id} />;
}

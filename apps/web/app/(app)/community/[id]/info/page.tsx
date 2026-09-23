import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getCommunityInfo, getCommunityWeeklyLeaderboard, listJoinRequests } from "@/lib/communities";
import { CommunityInfoClient } from "./CommunityInfoClient";

export default async function CommunityInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireProfile();

  const info = await getCommunityInfo(id);
  if (!info) notFound();

  const membership = info.members.find((m) => m.profileId === profile.id);
  if (!membership) notFound();

  const isAdmin = membership.role === "admin";
  const [leaderboard, joinRequests] = await Promise.all([
    getCommunityWeeklyLeaderboard(id),
    isAdmin ? listJoinRequests(profile.id, id) : Promise.resolve([]),
  ]);

  const weeklyPointsByProfileId = Object.fromEntries(leaderboard.map((l) => [l.profileId, l.weeklyPoints]));

  return (
    <CommunityInfoClient
      community={{
        id: info.community.id,
        name: info.community.name,
        description: info.community.description,
        imageUrl: info.community.imageUrl,
        isPublic: info.community.isPublic,
        requiresApproval: info.community.requiresApproval,
        inviteCode: info.community.inviteCode,
      }}
      members={info.members}
      weeklyPointsByProfileId={weeklyPointsByProfileId}
      viewerProfileId={profile.id}
      viewerRole={membership.role}
      joinRequests={joinRequests}
    />
  );
}

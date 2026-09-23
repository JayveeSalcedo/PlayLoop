import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getCommunityInfo, getCommunityMessages } from "@/lib/communities";
import { ChatView } from "./ChatView";

export default async function CommunityChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireProfile();

  const info = await getCommunityInfo(id);
  if (!info) notFound();

  const membership = info.members.find((m) => m.profileId === profile.id) ?? null;
  const initialMessages = membership ? await getCommunityMessages(id, { limit: 30, viewerProfileId: profile.id }) : [];

  return (
    <ChatView
      community={{
        id: info.community.id,
        name: info.community.name,
        imageUrl: info.community.imageUrl,
        isPublic: info.community.isPublic,
        requiresApproval: info.community.requiresApproval,
      }}
      viewerProfileId={profile.id}
      role={membership?.role ?? null}
      members={info.members}
      initialMessages={initialMessages}
    />
  );
}

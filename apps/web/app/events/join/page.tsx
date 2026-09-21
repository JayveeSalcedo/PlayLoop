import { ArenaPlayer } from "./ArenaPlayer";
import { requireProfile } from "@/lib/profile";

export const metadata = {
  title: "PlayLoop Arena — Join Game",
  description: "Join a live arena game on your phone.",
};

export default async function EventJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const { profile } = await requireProfile();

  return (
    <ArenaPlayer
      profileId={profile.id}
      profileName={profile.name ?? "Player"}
      avatarIndex={profile.avatarIndex}
      initialCode={code?.toUpperCase()}
    />
  );
}

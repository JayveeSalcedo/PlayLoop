import Link from "next/link";
import { providerLabel } from "@/lib/generation/jobs";
import { requireProfile } from "@/lib/profile";
import { getLeaguesForProfile } from "@/lib/leagues";
import { CreatorWizard } from "./CreatorWizard";
import { type LeagueOption } from "./LeaguePicker";

/**
 * One creation flow for everyone: describe a game and the AI writes it, or
 * pick a classic template and fill it in — both live on this same screen,
 * not two separate destinations. Picking a template continues through the
 * existing Customise/Test/Publish steps unchanged; generating a game hands
 * off to the job-progress page instead.
 */
export default async function CreatePage() {
  const { profile } = await requireProfile();
  const { joined } = await getLeaguesForProfile(profile.id);

  const leagues: LeagueOption[] = joined.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    icon: l.icon,
    color: l.color,
    memberCount: l.memberCount,
  }));

  return (
    <>
      <CreatorWizard
        aiProviderLabel={await providerLabel()}
        leagues={leagues}
      />
      <div className="mx-auto max-w-md px-6 pb-6">
        <Link href="/create/games" className="text-sm font-extrabold underline">
          My games
        </Link>
      </div>
    </>
  );
}

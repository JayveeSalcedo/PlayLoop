import Link from "next/link";
import { providerLabel } from "@/lib/generation/jobs";
import { requireProfile } from "@/lib/profile";
import { CreatorWizard } from "./CreatorWizard";

/**
 * One creation flow for everyone: describe a game and the AI writes it, or
 * pick a classic template and fill it in — both live on this same screen,
 * not two separate destinations. Picking a template continues through the
 * existing Customise/Test/Publish steps unchanged; generating a game hands
 * off to the job-progress page instead.
 */
export default async function CreatePage() {
  await requireProfile();

  return (
    <>
      <CreatorWizard aiProviderLabel={providerLabel()} />
      <div className="mx-auto max-w-md px-6 pb-6">
        <Link href="/create/games" className="text-sm font-extrabold underline">
          My games
        </Link>
      </div>
    </>
  );
}

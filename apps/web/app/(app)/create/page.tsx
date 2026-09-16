import { EXAMPLE_GAMES } from "@playloop/runtime";
import Link from "next/link";
import { canUseStudio } from "@/lib/generation/access";
import { requireProfile } from "@/lib/profile";
import { CreatorWizard } from "./CreatorWizard";
import { StudioStart } from "./studio/StudioStart";

/** Reads an example's title and hint out of its meta without running it. */
function describe(code: string) {
  const title = /title:\s*"([^"]+)"/.exec(code)?.[1] ?? "Example game";
  const hint = /hint:\s*"([^"]+)"/.exec(code)?.[1] ?? "";
  return { title, hint };
}

export default async function CreatePage() {
  const { profile } = await requireProfile();

  // The prompt-first studio, for the accounts it's open to so far; everyone
  // else keeps the template wizard exactly as before.
  if (canUseStudio(profile)) {
    return <StudioStart examples={EXAMPLE_GAMES.map((e) => ({ id: e.id, ...describe(e.code) }))} />;
  }

  return (
    <>
      <CreatorWizard />
      <div className="mx-auto max-w-md px-6 pb-6">
        <Link href="/create/games" className="text-sm font-extrabold underline">
          My games
        </Link>
      </div>
    </>
  );
}

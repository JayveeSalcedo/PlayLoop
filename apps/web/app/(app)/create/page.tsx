import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { CreatorWizard } from "./CreatorWizard";

export default async function CreatePage() {
  await requireProfile();

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

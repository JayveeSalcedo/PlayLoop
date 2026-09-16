import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { CreatorWizard } from "../CreatorWizard";

/** The classic template wizard, reached from the studio's "Use a template". */
export default async function TemplatePage() {
  await requireProfile();

  return (
    <>
      <CreatorWizard />
      <div className="mx-auto max-w-md px-6 pb-6">
        <Link href="/create" className="text-sm font-extrabold underline">
          Back
        </Link>
      </div>
    </>
  );
}

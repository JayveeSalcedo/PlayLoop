import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/generation/access";
import { getJob } from "@/lib/generation/jobs";
import { CreateJobRunner } from "./CreateJobRunner";

/** A new game being made from an idea: shows progress, then opens the studio on the result. */
export default async function CreateJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireStudio();
  const job = await getJob((await params).id, profile.id);
  if (!job) notFound();
  return <CreateJobRunner initial={job} />;
}

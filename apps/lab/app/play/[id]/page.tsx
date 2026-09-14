import { notFound } from "next/navigation";
import { slotImageDataUrls } from "@/lib/images";
import { cachedReport, getGame } from "@/lib/lab";
import { getProject } from "@/lib/projects";
import { GameRunner } from "./GameRunner";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  const [{ id }, { project: projectId }] = await Promise.all([params, searchParams]);
  const game = await getGame(id);
  if (!game?.meta) notFound();
  const [report, images, project] = await Promise.all([cachedReport(game), slotImageDataUrls(game.id), projectId ? getProject(projectId) : null]);
  const failedChecks = report ? report.checks.filter((c) => c.status === "fail").map((c) => c.title) : null;
  return <GameRunner gameId={game.id} code={game.code} meta={game.meta} failedChecks={failedChecks} images={images} projectId={project?.id ?? null} />;
}

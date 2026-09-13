import { notFound } from "next/navigation";
import { cachedReport, getGame } from "@/lib/lab";
import { GameRunner } from "./GameRunner";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game?.meta) notFound();
  const report = await cachedReport(game);
  const failedChecks = report ? report.checks.filter((c) => c.status === "fail").map((c) => c.title) : null;
  return <GameRunner gameId={game.id} code={game.code} meta={game.meta} failedChecks={failedChecks} />;
}

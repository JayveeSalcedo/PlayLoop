import Link from "next/link";
import { cachedReport, listGames, recentPlays } from "@/lib/lab";
import { REASON_LABELS } from "@/lib/shared";

export const dynamic = "force-dynamic";

export default async function LabHome() {
  const [games, plays] = await Promise.all([listGames(), recentPlays()]);
  const reports = new Map(await Promise.all(games.map(async (g) => [g.id, await cachedReport(g)] as const)));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-3">
        <span className="chip info self-start">Test app · no real points</span>
        <h1 className="text-4xl font-extrabold tracking-tight">PlayLoop Lab</h1>
        <p className="max-w-prose font-semibold text-soft">
          Play code games in the sandbox. When a game ends, the server replays your recorded inputs and decides the score
          itself. Nothing here touches the PlayLoop app, its database or anyone&apos;s points.
        </p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="games-h">
        <div className="flex items-end justify-between gap-3">
          <h2 id="games-h" className="text-xl font-extrabold">
            Games
          </h2>
          <div className="flex gap-2">
            <Link href="/new" className="btn sm">
              Paste code
            </Link>
            <Link href="/create" className="btn go sm">
              Create with AI
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {games.map((game) => (
            <li key={game.id} className="card flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="text-lg">{game.meta?.title ?? game.id}</b>
                <span className="chip">{game.source === "example" ? "Example" : "Added"}</span>
              </div>
              <LabStatus report={reports.get(game.id) ?? null} gameId={game.id} />
              {game.meta ? (
                <>
                  <p className="text-sm font-semibold text-soft">{game.meta.hint}</p>
                  <p className="text-xs font-bold text-soft">
                    {game.meta.maxSeconds} s max
                    {game.meta.lives ? ` · ${game.meta.lives} lives` : ""}
                    {game.meta.imageSlots?.length ? ` · ${game.meta.imageSlots.length} image slot(s)` : ""}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Link href={`/play/${game.id}`} className="btn go sm flex-1">
                      Play
                    </Link>
                    <Link href={`/games/${game.id}/report`} className="btn sm flex-1">
                      Checks
                    </Link>
                  </div>
                </>
              ) : (
                <p className="text-sm font-bold text-gum">Can&apos;t load: {game.problem}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="plays-h">
        <h2 id="plays-h" className="text-xl font-extrabold">
          Recent verifications
        </h2>
        {plays.length === 0 ? (
          <p className="font-semibold text-soft">No plays yet. Play a game and its verification shows up here.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-soft">
                  <th className="px-3 py-2">Game</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2 text-right">Claimed</th>
                  <th className="px-3 py-2 text-right">Replay</th>
                  <th className="px-3 py-2 text-right">Verify</th>
                </tr>
              </thead>
              <tbody>
                {plays.map((p) => (
                  <tr key={p.sessionId} className="border-t-2 border-paper">
                    <td className="px-3 py-2 font-bold">{p.title}</td>
                    <td className="px-3 py-2">
                      {p.verdict.ok ? (
                        <span className="chip ok">Verified</span>
                      ) : (
                        <span className="chip bad" title={p.verdict.detail}>
                          {REASON_LABELS[p.verdict.reason] ?? p.verdict.reason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.claimedScore}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.verdict.ok ? p.verdict.score : (p.verdict.replayScore ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.verdict.verifyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function LabStatus({ report, gameId }: { report: Awaited<ReturnType<typeof cachedReport>>; gameId: string }) {
  if (!report) {
    return (
      <Link href={`/games/${gameId}/report`} className="self-start text-xs font-bold text-soft underline">
        Checks not run yet
      </Link>
    );
  }
  const failed = report.checks.filter((c) => c.status === "fail").length;
  return (
    <Link href={`/games/${gameId}/report`} className={`${report.verdict === "pass" ? "chip ok" : "chip bad"} self-start`}>
      {report.verdict === "pass" ? "✓ Checks passed" : `✗ ${failed} check${failed === 1 ? "" : "s"} failed`}
    </Link>
  );
}

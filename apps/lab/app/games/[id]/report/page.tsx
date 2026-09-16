import type { CheckStatus, LabReport } from "@playloop/replay";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getGame, reportFor, type LabGame } from "@/lib/lab";
import { ChangeForm } from "./ChangeForm";
import { CopyButton, RerunButton } from "./ReportActions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STATUS: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "Pass", className: "chip ok" },
  fail: { label: "Fail", className: "chip bad" },
  warn: { label: "Warning", className: "chip info" },
  skip: { label: "Skipped", className: "chip" },
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm font-bold text-soft underline">
        ← All games
      </Link>
      <header className="flex flex-col gap-2">
        <span className="chip info self-start">Game lab</span>
        <h1 className="text-3xl font-extrabold tracking-tight">{game.meta?.title ?? "Untitled game"}</h1>
        <p className="max-w-prose font-semibold text-soft">
          Bots play the game in the server sandbox, their plays are replayed to check the score can be verified, and the code is
          scanned for things that can&apos;t run on the server.
        </p>
      </header>
      <Suspense fallback={<Running />}>
        <Report game={game} />
      </Suspense>
    </main>
  );
}

function Running() {
  return (
    <div className="card flex flex-col gap-2 p-5" role="status">
      <p className="text-lg font-extrabold">Running checks…</p>
      <p className="font-semibold text-soft">Bots are playing the game about nine times and replaying their plays. This takes a few seconds.</p>
    </div>
  );
}

async function Report({ game }: { game: LabGame }) {
  const report: LabReport = await reportFor(game);
  const failures = report.checks.filter((c) => c.status === "fail").length;

  return (
    <>
      <section className="card flex flex-col gap-3 p-5" aria-labelledby="verdict-h">
        <div className="flex flex-wrap items-center gap-3">
          <span className={report.verdict === "pass" ? "chip ok" : "chip bad"}>{report.verdict === "pass" ? "✓ Ready to review" : "✗ Needs fixes"}</span>
          <span className="text-xs font-bold text-soft">
            Checked in {(report.durationMs / 1000).toFixed(1)} s · {new Date(report.checkedAt).toLocaleString("en-GB")}
          </span>
        </div>
        <h2 id="verdict-h" className="text-xl font-extrabold">
          {report.verdict === "pass" ? "All checks passed." : `${failures} check${failures === 1 ? "" : "s"} failed.`}
        </h2>
        <div className="flex flex-wrap gap-2">
          {game.meta ? (
            <Link href={`/play/${game.id}`} className="btn go sm">
              Play it
            </Link>
          ) : null}
          {game.meta?.imageSlots?.length ? (
            <Link href={`/games/${game.id}/images`} className="btn sm">
              Images ({game.meta.imageSlots.length})
            </Link>
          ) : null}
          <RerunButton gameId={game.id} />
        </div>
      </section>

      {game.meta ? <ChangeForm gameId={game.id} suggestion={report.fixPrompt} /> : null}

      <section className="flex flex-col gap-3" aria-labelledby="checks-h">
        <h2 id="checks-h" className="text-xl font-extrabold">
          Checks
        </h2>
        <ol className="card divide-y-2 divide-paper">
          {report.checks.map((check) => (
            <li key={check.id} className="flex flex-col gap-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={STATUS[check.status].className}>{STATUS[check.status].label}</span>
                <b>{check.title}</b>
              </div>
              <p className="text-sm font-semibold">{check.summary}</p>
              {check.details.length > 0 ? (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-soft">
                  {check.details.map((d, i) => (
                    <li key={i} className="break-words">
                      {d}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {report.fixPrompt ? (
        <section className="flex flex-col gap-3" aria-labelledby="fix-h">
          <div className="flex items-end justify-between gap-3">
            <h2 id="fix-h" className="text-xl font-extrabold">
              Message for the AI
            </h2>
            <CopyButton text={report.fixPrompt} />
          </div>
          <p className="text-sm font-semibold text-soft">
            When the AI makes a game, this is sent back to it automatically. “Fix what the checks found” above sends it too.
          </p>
          <pre className="lab-code min-h-0 overflow-x-auto whitespace-pre-wrap">{report.fixPrompt}</pre>
        </section>
      ) : null}

      {report.runs.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="runs-h">
          <h2 id="runs-h" className="text-xl font-extrabold">
            Bot plays
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-soft">
                  <th className="px-3 py-2">Bot</th>
                  <th className="px-3 py-2">Seed</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Lasted</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((r, i) => (
                  <tr key={i} className="border-t-2 border-paper">
                    <td className="px-3 py-2 font-bold capitalize">{r.bot}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.seed}</td>
                    <td className="px-3 py-2">
                      {r.ok ? <span className="chip ok">{r.endReason?.replace("_", " ")}</span> : <span className="chip bad" title={r.error}>crashed</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? r.score : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.ok ? `${((r.ticks ?? 0) / 60).toFixed(1)} s` : r.tick ? `${(r.tick / 60).toFixed(1)} s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

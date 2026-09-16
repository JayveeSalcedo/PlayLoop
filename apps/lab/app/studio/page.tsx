import Link from "next/link";
import { providerLabel } from "@/lib/jobs";
import { listGames } from "@/lib/lab";
import { currentVersion, listProjects, projectLabel } from "@/lib/projects";
import { Steps } from "./Steps";
import { StudioStart } from "./StudioStart";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [games, projects] = await Promise.all([listGames(), listProjects()]);
  const templates = games
    .filter((g) => g.source === "example" && g.meta)
    .map((g) => ({ id: g.id, title: g.meta!.title, hint: g.meta!.hint, code: g.code, imageSlots: g.meta!.imageSlots?.length ?? 0 }));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm font-bold text-soft underline">
          ← Lab home
        </Link>
        <span className="chip info">Studio prototype · no real points</span>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">Make a game</h1>
      <Steps current="idea" />
      <StudioStart templates={templates} provider={providerLabel()} />

      {projects.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="drafts-h">
          <h2 id="drafts-h" className="text-xl font-extrabold">
            Your drafts
          </h2>
          <ul className="card divide-y-2 divide-paper">
            {projects.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link href={`/studio/${p.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-paper">
                  <span className="min-w-0">
                    <b className="block truncate">{projectLabel(p)}</b>
                    <span className="text-xs font-bold text-soft">
                      {p.versions.length} version{p.versions.length === 1 ? "" : "s"} · {new Date(p.updatedAt).toLocaleString("en-GB")}
                    </span>
                  </span>
                  <span className={p.submittedAt ? "chip ok" : p.pendingJobId ? "chip info" : "chip"}>
                    {p.submittedAt ? "Sent for review" : p.pendingJobId ? "AI working" : currentVersion(p) ? "Draft" : "Not made"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

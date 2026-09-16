import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { slotImageDataUrls } from "@/lib/images";
import { cachedReport, getGame, reportFor, type LabGame } from "@/lib/lab";
import { currentVersion, getProject, readiness, settlePendingJob, type Project } from "@/lib/projects";
import { REASON_LABELS } from "@/lib/shared";
import { Steps, type StudioStep } from "../Steps";
import { ChangePanel, ImagesPanel, PendingJob, PracticePlayer, SubmitButton, VersionList } from "./StudioClient";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VIA_LABEL = { template: "Example", "ai-create": "AI made it", "ai-change": "AI change", "ai-fix": "AI fix" } as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const [{ id }, { step: rawStep }] = await Promise.all([params, searchParams]);
  const loaded = await getProject(id);
  if (!loaded) notFound();
  const project = await settlePendingJob(loaded);
  const version = currentVersion(project);
  const game = version ? await getGame(version.gameId) : null;
  const step: StudioStep = rawStep === "test" || rawStep === "publish" ? rawStep : "customise";
  const ready = await readiness(project, game);
  const done: StudioStep[] = ["idea", ...(version ? (["customise"] as const) : []), ...(ready.testedCurrent ? (["test"] as const) : []), ...(project.submittedAt ? (["publish"] as const) : [])];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/studio" className="text-sm font-bold text-soft underline">
          ← All drafts
        </Link>
        <span className="chip info">Studio prototype · no real points</span>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{version?.title ?? "New game"}</h1>
        <Steps current={step} projectId={project.id} done={done} />
      </div>

      {!version ? (
        <NoGameYet project={project} />
      ) : !game?.meta ? (
        <p className="card p-5 font-bold text-gum">This version&apos;s game file is missing.</p>
      ) : step === "customise" ? (
        <CustomiseStep project={project} game={game} />
      ) : step === "test" ? (
        <TestStep project={project} game={game} />
      ) : (
        <PublishStep project={project} game={game} />
      )}
    </main>
  );
}

function NoGameYet({ project }: { project: Project }) {
  if (project.pendingJobId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-semibold text-soft">“{project.origin.kind === "idea" ? project.origin.idea : ""}”</p>
        <PendingJob jobId={project.pendingJobId} />
      </div>
    );
  }
  return (
    <div className="card flex flex-col gap-3 p-5">
      <span className="chip bad self-start">The AI couldn&apos;t make this one</span>
      <p className="font-semibold">Try describing the idea differently, or start from an example.</p>
      <Link href="/studio" className="btn go sm self-start">
        Back to ideas
      </Link>
    </div>
  );
}

async function CustomiseStep({ project, game }: { project: Project; game: LabGame }) {
  const version = currentVersion(project)!;
  const images = await slotImageDataUrls(game.id);
  const report = await cachedReport(game);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,340px)_1fr]">
      <aside className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
        <PracticePlayer key={game.id} code={game.code} images={images} maxSeconds={game.meta!.maxSeconds} />
        <p className="text-center text-xs font-semibold text-soft">Practice play: nothing is recorded. The verified play happens in Test.</p>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="card flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">v{version.n} · {VIA_LABEL[version.via]}</span>
            <Suspense fallback={<span className="chip">Running checks…</span>}>
              <ChecksChip game={game} />
            </Suspense>
          </div>
          <p className="font-semibold">{version.summary || game.meta!.hint}</p>
          {version.notes ? <p className="text-sm font-semibold text-soft">AI notes: {version.notes}</p> : null}
        </section>

        {game.meta!.imageSlots?.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="images-h">
            <h2 id="images-h" className="text-xl font-extrabold">
              Your images
            </h2>
            <ImagesPanel key={game.id} gameId={game.id} code={game.code} slots={game.meta!.imageSlots} images={images} />
          </section>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="change-h">
          <h2 id="change-h" className="text-xl font-extrabold">
            Change it
          </h2>
          <ChangePanel projectId={project.id} pendingJobId={project.pendingJobId} canFix={report?.verdict === "fail"} />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="versions-h">
          <h2 id="versions-h" className="text-xl font-extrabold">
            Versions
          </h2>
          <Suspense fallback={<p className="text-sm font-semibold text-soft">Loading versions…</p>}>
            <Versions project={project} />
          </Suspense>
        </section>

        <div className="flex justify-end">
          <Link href={`/studio/${project.id}?step=test`} className="btn go">
            Test it →
          </Link>
        </div>
      </div>
    </div>
  );
}

async function ChecksChip({ game }: { game: LabGame }) {
  const report = await reportFor(game);
  const failed = report.checks.filter((c) => c.status === "fail").length;
  return (
    <Link href={`/games/${game.id}/report`} className={report.verdict === "pass" ? "chip ok" : "chip bad"}>
      {report.verdict === "pass" ? "✓ Passes every check" : `✗ ${failed} check${failed === 1 ? "" : "s"} failing`}
    </Link>
  );
}

async function Versions({ project }: { project: Project }) {
  const rows = await Promise.all(
    [...project.versions].reverse().map(async (v) => {
      const game = await getGame(v.gameId);
      const report = game ? await cachedReport(game) : null;
      return { n: v.n, label: v.via === "template" ? `Started from ${v.request}` : v.request, via: VIA_LABEL[v.via], title: v.title, verdict: report?.verdict ?? null, at: v.createdAt };
    }),
  );
  return <VersionList projectId={project.id} current={project.current} rows={rows} />;
}

async function TestStep({ project, game }: { project: Project; game: LabGame }) {
  const report = await reportFor(game);
  const play = project.testPlay;
  const forCurrent = play?.gameId === game.id;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-xl font-extrabold">Play it for real</h2>
        <p className="font-semibold text-soft">
          This play is recorded and the server replays it, exactly like a player&apos;s would be. It proves the version you&apos;re about to send scores correctly on the server.
        </p>
        {report.verdict === "fail" ? (
          <p className="chip bad self-start whitespace-normal">
            This version still fails {report.checks.filter((c) => c.status === "fail").length} check(s). Fix them in Customise first.
          </p>
        ) : null}
        <Link href={`/play/${game.id}?project=${project.id}`} className="btn go self-start">
          {forCurrent ? "Play again" : "Start test play"}
        </Link>
      </section>

      {play ? (
        <section className="card flex flex-col gap-2 p-5">
          <h3 className="font-extrabold">Last test play</h3>
          {!forCurrent ? (
            <p className="text-sm font-semibold text-soft">It was for an earlier version, so play the current one again.</p>
          ) : play.ok ? (
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="chip ok">✓ Verified by replay</span> Score {play.score}
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="chip bad">✗ Not verified</span> {REASON_LABELS[play.reason ?? ""] ?? play.reason}
            </p>
          )}
        </section>
      ) : null}

      <div className="flex justify-between">
        <Link href={`/studio/${project.id}?step=customise`} className="btn">
          ← Customise
        </Link>
        <Link href={`/studio/${project.id}?step=publish`} className="btn go">
          Publish →
        </Link>
      </div>
    </div>
  );
}

async function PublishStep({ project, game }: { project: Project; game: LabGame }) {
  await reportFor(game);
  const ready = await readiness(project, game);
  const version = currentVersion(project)!;
  const items = [
    { ok: ready.checksPassed, label: "Passes every game check", fix: { href: `/studio/${project.id}?step=customise`, text: "Fix in Customise" } },
    { ok: ready.testedCurrent, label: "Verified test play of this version", fix: { href: `/studio/${project.id}?step=test`, text: "Test it" } },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-xl font-extrabold">Ready to go live?</h2>
          <p className="font-semibold text-soft">
            Sending <b>{version.title}</b> (version {version.n}) puts it in the review queue. In the real app it appears in players&apos; feeds once approved.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.label} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-bold">
                <span className={item.ok ? "chip ok" : "chip bad"}>{item.ok ? "✓" : "✗"}</span>
                {item.label}
              </span>
              {!item.ok ? (
                <Link href={item.fix.href} className="btn sm">
                  {item.fix.text}
                </Link>
              ) : null}
            </li>
          ))}
          {ready.imageSlots > 0 ? (
            <li className="flex items-center gap-2 font-bold">
              <span className={ready.imagesAdded === ready.imageSlots ? "chip ok" : "chip"}>{ready.imagesAdded === ready.imageSlots ? "✓" : "–"}</span>
              Images: {ready.imagesAdded} of {ready.imageSlots} added
              <span className="text-xs font-semibold text-soft">(optional; empty spots show the game&apos;s own shapes)</span>
            </li>
          ) : null}
        </ul>
        {project.submittedAt ? (
          <p className="card bg-mint p-3 font-extrabold">✓ Sent for review {new Date(project.submittedAt).toLocaleString("en-GB")}. (Lab only: nothing is really published.)</p>
        ) : (
          <SubmitButton projectId={project.id} disabled={!ready.ready} />
        )}
      </section>
      <div className="flex justify-start">
        <Link href={`/studio/${project.id}?step=test`} className="btn">
          ← Test
        </Link>
      </div>
    </div>
  );
}

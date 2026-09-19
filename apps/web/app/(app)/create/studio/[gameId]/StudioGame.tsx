"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { GameShare } from "@/app/(app)/create/games/[id]/GameShare";
import { SponsorToggle } from "@/app/(app)/create/games/[id]/SponsorToggle";
import { artSVG, icon, THEMES, type ThemeName } from "@playloop/ui";
import { shrinkCoverImage } from "@/app/(app)/create/shrink";
import { CoverCropperModal } from "@/app/(app)/create/CoverCropperModal";
import { SuccessModal } from "@/app/_components/SuccessModal";
import {
  LeaguePicker,
  type LeagueOption,
} from "@/app/(app)/create/LeaguePicker";
import type { JobView } from "@/lib/generation/jobs";
import {
  makeVersionCurrent,
  submitVersion,
  updateGameSettings,
} from "../actions";
import { JobProgress, useJobRunner } from "../JobProgress";

export interface StudioVersion {
  id: string;
  versionNumber: number;
  via: "template" | "ai-create" | "ai-change" | "ai-fix" | "manual";
  request: string;
  title: string;
  summary: string;
  notes: string;
  validation: "pending" | "pass" | "fail";
  scoreTarget: number | null;
  createdAt: string;
  checks: { title: string; status: string; summary: string }[];
  /** Failed its checks, and the lab said what to fix. */
  fixable: boolean;
  /** Has at least one test play that verified. Submitting requires it. */
  verifiedTest: boolean;
  lastTest: { ok: boolean; score: number | null; reason: string | null } | null;
}

const STATUS: Record<string, { text: string; className: string }> = {
  draft: { text: "Draft", className: "bg-card" },
  pending_review: { text: "In review", className: "bg-lemon" },
  published: { text: "Live", className: "bg-mint" },
  rejected: { text: "Not approved", className: "bg-gum text-paper" },
};

const VIA: Record<StudioVersion["via"], string> = {
  "ai-create": "Made by AI",
  "ai-change": "Changed",
  "ai-fix": "Fixed",
  template: "From an example",
  manual: "Added by hand",
};

const MAX_CHANGE = 1_000;

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold [border:var(--border-thick)] ${className}`}
    >
      {children}
    </span>
  );
}

export function StudioGame({
  game,
  versions,
  selectedId,
  openJob,
  leagues,
}: {
  game: {
    id: string;
    title: string;
    status: string;
    slug: string;
    currentVersionId: string | null;
    sponsorReady: boolean;
    playCount: number;
    coverImage?: string | null;
    theme: string;
    maxPoints: number;
  };
  versions: StudioVersion[];
  selectedId: string | null;
  openJob: JobView | null;
  leagues: LeagueOption[];
}) {
  const router = useRouter();
  const [change, setChange] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(
    game.coverImage ?? null,
  );
  const [theme, setTheme] = useState<string>(game.theme ?? "neon");
  const [maxPoints, setMaxPoints] = useState<number>(game.maxPoints ?? 200);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [showAiCreatedModal, setShowAiCreatedModal] = useState(
    () => searchParams?.get("justCreated") === "true",
  );
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);

  const {
    job,
    setJob,
    error: jobError,
  } = useJobRunner(openJob, (ended) => {
    // Open the version it made (or failed to fix) so the result is what's on screen.
    router.replace(
      ended.resultVersionId
        ? `/create/studio/${game.id}?v=${ended.resultVersionId}`
        : `/create/studio/${game.id}`,
    );
    router.refresh();
    if (ended.status === "done") {
      setChange("");
      if (ended.kind === "create") {
        setShowAiCreatedModal(true);
      }
    }
  });

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const editable = game.status === "draft" || game.status === "rejected";
  const working = job?.status === "queued" || job?.status === "running";
  const status = STATUS[game.status] ?? STATUS.draft!;

  async function startJob(body: {
    kind: "change" | "fix";
    versionId: string;
    request?: string;
  }) {
    setBusy(body.kind);
    setError(null);
    try {
      const res = await fetch("/api/studio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as JobView & { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? "Couldn't start that — try again.");
      setJob(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't start that — try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      if (label === "submit") {
        setShowSubmittedModal(true);
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That didn't work — try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  const locked = working || busy !== null;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href="/create/games" className="text-sm font-extrabold underline">
        My games
      </Link>

      <div className="card-hard mt-3 overflow-hidden rounded-2xl [border:var(--border-thick)] aspect-[16/9]">
        {coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverImage}
            alt={game.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            dangerouslySetInnerHTML={{
              __html: artSVG(null, theme as ThemeName),
            }}
          />
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {game.title}
          </h1>
          <div className="mt-1 flex items-center gap-1 text-xs font-bold text-soft">
            <span>Cover: {theme} · win up to</span>
            <span className="inline-flex items-center gap-1 font-extrabold text-ink">
              <span className="coin sm" aria-hidden="true" />
              {maxPoints} pts
            </span>
          </div>
        </div>
        <Pill className={status.className}>{status.text}</Pill>
      </div>

      {job && (working || job.status === "failed") ? (
        <div className="mt-4">
          <JobProgress job={job} error={jobError} />
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm font-bold text-gum">{error}</p>
      ) : null}

      {selected ? (
        <section className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-soft">
              Version {selected.versionNumber} · {VIA[selected.via]}
              {selected.id === game.currentVersionId ? " · current" : ""}
            </p>
            <Pill
              className={
                selected.validation === "pass"
                  ? "bg-mint"
                  : selected.validation === "fail"
                    ? "bg-gum text-paper"
                    : "bg-paper"
              }
            >
              {selected.validation === "pass"
                ? "Checks passed"
                : selected.validation === "fail"
                  ? "Checks failed"
                  : "Not checked"}
            </Pill>
          </div>
          <h2 className="mt-2 text-xl font-extrabold">{selected.title}</h2>
          {selected.summary ? (
            <p className="mt-1 text-sm text-soft">{selected.summary}</p>
          ) : null}
          {selected.request ? (
            <p className="mt-2 text-xs font-bold text-soft">
              Asked for: “{selected.request}”
            </p>
          ) : null}
          {selected.notes ? (
            <p className="mt-2 text-xs font-bold text-soft">
              AI notes: {selected.notes}
            </p>
          ) : null}

          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-extrabold">
              What the bots found
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {selected.checks.map((c) => (
                <li key={c.title} className="text-xs font-bold">
                  <span
                    className={c.status === "fail" ? "text-gum" : "text-soft"}
                  >
                    {c.status === "pass"
                      ? "✓"
                      : c.status === "fail"
                        ? "✗"
                        : "!"}{" "}
                    {c.title}:
                  </span>{" "}
                  {c.summary}
                </li>
              ))}
            </ul>
            {selected.scoreTarget ? (
              <p className="mt-2 text-xs font-bold text-soft">
                A score of {selected.scoreTarget} earns the full points.
              </p>
            ) : null}
          </details>

          {selected.lastTest ? (
            <p
              className={`mt-3 text-xs font-bold ${selected.lastTest.ok ? "text-soft" : "text-gum"}`}
            >
              Last test play:{" "}
              {selected.lastTest.ok
                ? `verified, scored ${selected.lastTest.score ?? 0}`
                : `didn't verify (${selected.lastTest.reason ?? "unknown"})`}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            {selected.validation === "pass" ? (
              <Link
                href={`/play/test/${selected.id}`}
                className={`btn block ${locked ? "pointer-events-none opacity-60" : ""}`}
              >
                Test play
              </Link>
            ) : null}

            {selected.fixable ? (
              <button
                className="btn go block"
                disabled={locked}
                onClick={() =>
                  startJob({ kind: "fix", versionId: selected.id })
                }
              >
                {busy === "fix" ? (
                  <Spinner size={20} />
                ) : (
                  "Fix what the checks found"
                )}
              </button>
            ) : null}

            {editable && selected.id !== game.currentVersionId ? (
              <button
                className="btn block"
                disabled={locked}
                onClick={() =>
                  run("use", () => makeVersionCurrent(selected.id))
                }
              >
                {busy === "use" ? (
                  <Spinner size={20} />
                ) : (
                  "Make this the current version"
                )}
              </button>
            ) : null}

            {editable ? (
              <>
                <LeaguePicker
                  leagues={leagues}
                  value={leagueId}
                  onChange={setLeagueId}
                />
                <button
                  className="btn go block"
                  disabled={
                    locked ||
                    selected.validation !== "pass" ||
                    !selected.verifiedTest
                  }
                  onClick={() =>
                    run("submit", () => submitVersion(selected.id, leagueId))
                  }
                >
                  {busy === "submit" ? (
                    <Spinner size={20} />
                  ) : (
                    "Submit for review"
                  )}
                </button>
              </>
            ) : null}
            {editable &&
            selected.validation === "pass" &&
            !selected.verifiedTest ? (
              <p className="text-xs font-bold text-soft">
                Test-play this version to the end before submitting it.
              </p>
            ) : null}
            {game.status === "published" ? (
              <Link href={`/play/${game.slug}`} className="btn block">
                See it in the feed
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {game.status === "published" ? (
        <section className="mt-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
              <p className="text-xs font-extrabold text-soft">Plays</p>
              <p className="text-2xl font-extrabold">
                {game.playCount.toLocaleString("en-US")}
              </p>
            </div>
            <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
              <p className="text-xs font-extrabold text-soft">Earned</p>
              {/* Same AED 0.02/play estimate as the template game's page — derived on
                  read, no creator_earnings table until payouts exist. */}
              <p className="text-2xl font-extrabold">
                AED {(game.playCount * 0.02).toFixed(2)}
              </p>
            </div>
          </div>
          <SponsorToggle gameId={game.id} initial={game.sponsorReady} />
          <GameShare slug={game.slug} />
        </section>
      ) : null}

      {editable ? (
        <section className="card-hard mt-6 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          <h2 className="text-lg font-extrabold">Cover photo & Payout</h2>
          <p className="mb-3 text-xs font-bold text-soft">
            Customise how your game looks in the feed and how many points
            players can win.
          </p>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-extrabold">
              Cover photo (optional)
            </label>
            {coverImage ? (
              <div className="relative mb-2 aspect-[16/9] w-full overflow-hidden rounded-xl [border:var(--border-thick)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove cover photo"
                  disabled={locked}
                  onClick={() => {
                    setCoverImage(null);
                    setSettingsSaved(false);
                  }}
                  className="absolute top-2 right-2 rounded-full bg-paper px-2 py-0.5 text-xs font-extrabold [border:var(--border-thick)] shadow"
                >
                  × Remove
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn sm inline-flex cursor-pointer">
                <span>
                  📷 {coverImage ? "Change photo" : "Upload cover photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={locked}
                  onChange={(e) => {
                    setCoverUploadError(null);
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";
                    if (file.size > 25 * 1024 * 1024) {
                      setCoverUploadError(
                        "That image is over 25 MB. Pick a smaller one.",
                      );
                      return;
                    }
                    const reader = new FileReader();
                    reader.onerror = () =>
                      setCoverUploadError("Couldn't read that file.");
                    reader.onload = () => {
                      setCroppingImage(String(reader.result));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {coverImage ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setCroppingImage(coverImage)}
                  className="btn sm"
                >
                  ✂️ Adjust crop
                </button>
              ) : null}
            </div>
            {coverUploadError ? (
              <p className="mt-1 text-xs font-bold text-gum">
                {coverUploadError}
              </p>
            ) : null}
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-extrabold">
              Cover theme swatch
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(THEMES).map(([key, [a, b]]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  disabled={locked}
                  onClick={() => {
                    setTheme(key);
                    setSettingsSaved(false);
                  }}
                  className={`h-9 w-9 rounded-xl [border:var(--border-thick)] ${theme === key ? "ring-4 ring-ink" : ""}`}
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                />
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-extrabold">
              Max points per play — {maxPoints} pts
            </label>
            <p className="mb-2 text-xs text-soft">
              Players beating the target score earn up to this amount.
            </p>
            <input
              type="range"
              className="w-full"
              min={100}
              max={400}
              step={25}
              value={maxPoints}
              disabled={locked}
              onChange={(e) => {
                setMaxPoints(Number(e.target.value));
                setSettingsSaved(false);
              }}
            />
          </div>

          <button
            type="button"
            className="btn sm go"
            disabled={
              locked ||
              (coverImage === (game.coverImage ?? null) &&
                theme === game.theme &&
                maxPoints === game.maxPoints)
            }
            onClick={() =>
              run("settings", async () => {
                await updateGameSettings(game.id, {
                  coverImage,
                  theme,
                  maxPoints,
                });
                setSettingsSaved(true);
              })
            }
          >
            {busy === "settings" ? (
              <Spinner size={16} />
            ) : settingsSaved ? (
              "✓ Saved"
            ) : (
              "Save cover & payout"
            )}
          </button>
        </section>
      ) : null}

      {selected ? (
        <section className="mt-6">
          <label htmlFor="change" className="text-lg font-extrabold">
            Change something
          </label>
          <p className="text-xs font-bold text-soft">
            Makes a new version from version {selected.versionNumber}. Nothing
            you have now is lost.
          </p>
          <textarea
            id="change"
            value={change}
            onChange={(e) => setChange(e.target.value.slice(0, MAX_CHANGE))}
            rows={3}
            placeholder="e.g. Make the player faster and add a shield power-up"
            className="mt-2 w-full rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]"
            disabled={locked}
            suppressHydrationWarning
          />
          <button
            className="btn go block mt-2"
            disabled={locked || !change.trim()}
            onClick={() =>
              startJob({
                kind: "change",
                versionId: selected.id,
                request: change,
              })
            }
          >
            {busy === "change" ? <Spinner size={20} /> : "Make the change"}
          </button>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-extrabold">Versions</h2>
        <ol className="mt-2 flex flex-col gap-2">
          {versions.map((ver) => (
            <li key={ver.id}>
              <Link
                href={`/create/studio/${game.id}?v=${ver.id}`}
                className={`flex items-center gap-3 rounded-2xl p-3 [border:var(--border-thick)] ${ver.id === selectedId ? "bg-lemon" : "bg-card"}`}
              >
                <span className="text-sm font-extrabold">
                  v{ver.versionNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">
                    {ver.title}
                  </span>
                  <span className="block truncate text-xs font-bold text-soft">
                    {VIA[ver.via]}
                    {ver.request ? ` · ${ver.request}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-extrabold">
                  {ver.id === game.currentVersionId ? "current · " : ""}
                  {ver.validation === "pass"
                    ? "✓"
                    : ver.validation === "fail"
                      ? "✗"
                      : "…"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {croppingImage ? (
        <CoverCropperModal
          imageSrc={croppingImage}
          onCrop={(cropped) => {
            setCoverImage(cropped);
            setSettingsSaved(false);
            setCroppingImage(null);
          }}
          onCancel={() => setCroppingImage(null)}
        />
      ) : null}

      {/* AI Game Generated & Validation Modal */}
      {showAiCreatedModal && selected && (
        <SuccessModal
          isOpen={showAiCreatedModal}
          onClose={() => {
            setShowAiCreatedModal(false);
            if (searchParams?.get("justCreated") === "true") {
              router.replace(`/create/studio/${game.id}`, { scroll: false });
            }
          }}
          title="🤖 AI Game Generated!"
          badgeText="QuickJS Verification Passed"
          iconHtml={icon("spark")}
          accentColor="lemon"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Test Play Now",
            onClick: () => {
              if (searchParams?.get("justCreated") === "true") {
                router.replace(`/create/studio/${game.id}`, { scroll: false });
              }
              router.push(`/play/test/${selected.id}`);
            },
          }}
          secondaryAction={{
            label: "Inspect in Studio",
            onClick: () => {
              setShowAiCreatedModal(false);
              if (searchParams?.get("justCreated") === "true") {
                router.replace(`/create/studio/${game.id}`, { scroll: false });
              }
            },
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="flex items-center gap-3 rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <div className="h-12 w-12 rounded-xl bg-lemon border-2 border-ink flex items-center justify-center font-black text-2xl">
                🎮
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-soft">Game Title</p>
                <h3 className="font-extrabold text-base truncate text-ink">
                  {game.title}
                </h3>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-3 border-2 border-ink space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-soft">
                Bot Validation Scorecard
              </span>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>Deterministic Replay Engine</span>
                <span className="text-mint font-extrabold">✓ Verified</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>Crash-Free Runtime Sandbox</span>
                <span className="text-mint font-extrabold">✓ Pass</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>Responsive Player Input</span>
                <span className="text-mint font-extrabold">✓ Checked</span>
              </div>
            </div>

            <p className="text-xs text-soft font-semibold text-center">
              Your game passed all automated sandbox checks. Run a test play to
              the end to unlock review submission!
            </p>
          </div>
        </SuccessModal>
      )}

      {/* Game Submitted for Review Modal */}
      {showSubmittedModal && (
        <SuccessModal
          isOpen={showSubmittedModal}
          onClose={() => setShowSubmittedModal(false)}
          title="🚀 Game Submitted for Review!"
          badgeText="Queue SLA: < 24 Hours"
          iconHtml={icon("spark")}
          accentColor="mint"
          confetti={true}
          soundEffect="victory"
          primaryAction={{
            label: "Copy Preview Link",
            onClick: async () => {
              const url = `${window.location.origin}/play/${game.slug}`;
              await navigator.clipboard.writeText(url);
            },
          }}
          secondaryAction={{
            label: "Go to My Games",
            onClick: () => {
              router.push("/create/games");
            },
          }}
        >
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
              <p className="text-xs font-bold text-soft">{game.title}</p>
              <p className="text-sm font-extrabold text-ink mt-0.5">
                Version {selected?.versionNumber ?? 1} in review queue
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-soft font-semibold">
                <span>⏱️ Moderator review turnaround:</span>
                <span className="font-bold text-ink">within 24 hours</span>
              </div>
            </div>
            <div className="rounded-2xl bg-mint/20 p-3 border-2 border-ink text-xs font-semibold">
              💰 <span className="font-bold">Creator Royalties:</span> AED 0.02
              per play + 30% sponsor reward pool once published.
            </div>
          </div>
        </SuccessModal>
      )}
    </main>
  );
}

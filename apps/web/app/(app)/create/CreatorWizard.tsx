"use client";

import {
  CATCH_ITEMS,
  DIFFICULTIES,
  MAX_POINTS_MAX,
  MAX_POINTS_MIN,
  MAX_POINTS_STEP,
  MEMORY_PAIRS,
  QUIZ_MAX_QUESTIONS,
  REFLEX_TARGETS,
  TITLE_MAX,
  normalizeConfig,
  validateGameDraft,
  type GameDraft,
  type PlayableType,
} from "@playloop/games";
import {
  THEMES,
  artSVG,
  icon,
  itemShape,
  type GameArtType,
  type ItemKind,
  type ThemeName,
} from "@playloop/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { AiGenerateBox } from "./AiGenerateBox";
import { publishGame } from "./actions";
import { shrinkCoverImage, shrinkImage } from "./shrink";
import { CoverCropperModal } from "./CoverCropperModal";
import { TestPlay } from "./TestPlay";
import { LeaguePicker, type LeagueOption } from "./LeaguePicker";

const TEMPLATES: {
  type: PlayableType;
  name: string;
  blurb: string;
  best: string;
}[] = [
  {
    type: "quiz",
    name: "Quiz Blitz",
    blurb: "Four answers, one right. Speed earns a bonus.",
    best: "Trivia, launches, learning",
  },
  {
    type: "memory",
    name: "Memory Match",
    blurb: "Flip and match six pairs. Use your own images.",
    best: "Products, heritage, art",
  },
  {
    type: "catch",
    name: "Catch and Collect",
    blurb: "Drag to catch falling items. Dodge the bad ones.",
    best: "Hero products, campaigns",
  },
  {
    type: "reflex",
    name: "Tap Reflex",
    blurb: "Tap the good, dodge the bad. Chain combos.",
    best: "Events and big screens",
  },
];

const STEPS = ["Template", "Customise", "Test", "Publish"];

interface Draft {
  type: PlayableType | null;
  title: string;
  theme: ThemeName;
  difficulty: (typeof DIFFICULTIES)[number];
  maxPoints: number;
  coverImage: string | null;
  questions: { q: string; a: string[]; c: number }[];
  images: (string | null)[];
  item: ItemKind;
  target: (typeof REFLEX_TARGETS)[number];
}

const EMPTY: Draft = {
  type: null,
  title: "",
  theme: "sun",
  difficulty: "Medium",
  maxPoints: 200,
  coverImage: null,
  questions: [
    { q: "", a: ["", "", "", ""], c: 0 },
    { q: "", a: ["", "", "", ""], c: 0 },
  ],
  images: Array(MEMORY_PAIRS).fill(null),
  item: "star",
  target: "mint",
};

/** The draft in the shape @playloop/games validates and the server stores. */
function toGameDraft(d: Draft): GameDraft {
  const type = d.type ?? "quiz";
  const raw =
    type === "quiz"
      ? { questions: d.questions }
      : type === "memory"
        ? { images: d.images }
        : type === "catch"
          ? { item: d.item }
          : { target: d.target };
  return {
    type,
    title: d.title.trim(),
    theme: d.theme,
    difficulty: d.difficulty,
    maxPoints: d.maxPoints,
    coverImage: d.coverImage,
    config: normalizeConfig(type, raw),
  };
}

export function CreatorWizard({
  aiProviderLabel,
  leagues,
}: {
  aiProviderLabel: string;
  leagues: LeagueOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const gameDraft = useMemo(() => toGameDraft(draft), [draft]);
  const issues = useMemo(
    () => (draft.type ? validateGameDraft(gameDraft) : []),
    [gameDraft, draft.type],
  );
  const issueFor = (field: string) =>
    showErrors ? issues.find((i) => i.field === field)?.message : undefined;

  function next() {
    if (step === 0 && !draft.type) return;
    if (step === 1) {
      setShowErrors(true);
      if (issues.length > 0) return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const game = await publishGame(gameDraft, leagueId);
      router.push(`/create/games/${game.id}?published=1`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't publish that game — try again.",
      );
      setPublishing(false);
    }
  }

  if (testing)
    return <TestPlay draft={gameDraft} onClose={() => setTesting(false)} />;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Make a game</h1>

      <ol className="mt-4 mb-6 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`pop-in-${i + 1} flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold [border:var(--border-thick)] ${
              i === step
                ? "bg-ink text-paper"
                : i < step
                  ? "bg-mint"
                  : "bg-card text-soft"
            }`}
          >
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {draft.type ? (
        <div className="card-hard mb-6 overflow-hidden rounded-2xl [border:var(--border-thick)] aspect-[16/9]">
          {draft.coverImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={draft.coverImage}
              alt={draft.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              dangerouslySetInnerHTML={{
                __html: artSVG(
                  draft.type as GameArtType,
                  draft.theme,
                  draft.item,
                ),
              }}
            />
          )}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="flex flex-col gap-6">
          <AiGenerateBox providerLabel={aiProviderLabel} />

          <div
            className="flex items-center gap-3 text-sm font-bold text-soft"
            aria-hidden="true"
          >
            <span className="h-0.5 flex-1 bg-faint/40" />
            or start from a template
            <span className="h-0.5 flex-1 bg-faint/40" />
          </div>

          <section>
            <h2 className="text-xl font-extrabold">Start from a template</h2>
            <p className="mt-1 mb-4 text-sm font-bold text-soft">
              Every template is already fun and phone-ready. You bring the
              content.
            </p>
            <div className="flex flex-col gap-3">
              {TEMPLATES.map((t, i) => (
                <button
                  key={t.type}
                  onClick={() => set({ type: t.type, title: draft.title })}
                  className={`card-hard card-hard-hover pop-in-${i + 1} rounded-2xl p-4 text-left [border:var(--border-thick)] ${
                    draft.type === t.type ? "bg-lemon" : "bg-card"
                  }`}
                >
                  <b className="block">{t.name}</b>
                  <span className="block text-sm font-bold text-soft">
                    {t.blurb}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-soft">
                    Best for: {t.best}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {step === 1 && draft.type ? (
        <Customise draft={draft} set={set} issueFor={issueFor} />
      ) : null}

      {step === 2 && draft.type ? (
        <section>
          <h2 className="text-xl font-extrabold">
            Test it before it goes live
          </h2>
          <p className="mt-1 mb-4 text-sm font-bold text-soft">
            Play it exactly as players will. Nothing is published, and this test
            earns no points.
          </p>
          <button className="btn go block" onClick={() => setTesting(true)}>
            <span dangerouslySetInnerHTML={{ __html: icon("play", "fill") }} />{" "}
            Test play
          </button>
        </section>
      ) : null}

      {step === 3 && draft.type ? (
        <section>
          <h2 className="text-xl font-extrabold">Ready to go live</h2>
          <p className="mt-1 mb-4 text-sm font-bold text-soft">
            Publishing sends <b>{draft.title.trim()}</b> to review. Once
            it&apos;s approved it appears in every player&apos;s feed. Until
            then only you can see it.
          </p>
          <LeaguePicker
            leagues={leagues}
            value={leagueId}
            onChange={setLeagueId}
          />
          {error ? (
            <p className="mb-3 text-sm font-bold text-gum">{error}</p>
          ) : null}
          <button
            className="btn go block"
            onClick={publish}
            disabled={publishing}
          >
            {publishing ? (
              <>
                <Spinner size={22} /> Publishing…
              </>
            ) : (
              "Publish for review"
            )}
          </button>
        </section>
      ) : null}

      {showErrors && issues.length > 0 && step === 1 ? (
        <p className="mt-4 text-sm font-bold text-gum">{issues[0]?.message}</p>
      ) : null}

      <div className="mt-8 flex gap-3">
        {step > 0 ? (
          <button
            className="btn"
            onClick={() => setStep((s) => s - 1)}
            disabled={publishing}
          >
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            className="btn go flex-1"
            onClick={next}
            disabled={step === 0 && !draft.type}
          >
            {["Customise", "Test your game", "Go to publish"][step]}
          </button>
        ) : null}
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-extrabold">{label}</label>
      {hint ? (
        <p className="mb-2 text-xs font-bold text-soft">{hint}</p>
      ) : (
        <div className="mb-2" />
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-bold text-gum">{error}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]";

function Customise({
  draft,
  set,
  issueFor,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  issueFor: (field: string) => string | undefined;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-xl font-extrabold">Make it yours</h2>
      <p className="mt-1 mb-4 text-sm font-bold text-soft">
        The cover above updates as you go.
      </p>

      <Field label="Game title" error={issueFor("title")}>
        <input
          className={inputClass}
          maxLength={TITLE_MAX}
          value={draft.title}
          placeholder="Coffee Quiz"
          onChange={(e) => set({ title: e.target.value })}
          suppressHydrationWarning
        />
      </Field>

      <Field label="Cover colour" error={issueFor("theme")}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(THEMES).map(([key, [a, b]]) => (
            <button
              key={key}
              aria-label={key}
              onClick={() => set({ theme: key })}
              className={`h-10 w-10 rounded-xl [border:var(--border-thick)] ${draft.theme === key ? "ring-4 ring-ink" : ""}`}
              style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
            />
          ))}
        </div>
      </Field>

      <Field label="Custom cover photo (optional)">
        <div className="flex items-center gap-3">
          {draft.coverImage ? (
            <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl [border:var(--border-thick)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.coverImage}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label="Remove cover photo"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-paper text-[10px] font-extrabold [border:var(--border-thick)]"
                onClick={() => set({ coverImage: null })}
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn sm inline-flex cursor-pointer">
              <span>
                📷 {draft.coverImage ? "Change photo" : "Upload photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  setUploadError(null);
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  if (file.size > 25 * 1024 * 1024) {
                    setUploadError(
                      "That image is over 25 MB. Pick a smaller one.",
                    );
                    return;
                  }
                  const reader = new FileReader();
                  reader.onerror = () =>
                    setUploadError("Couldn't read that file.");
                  reader.onload = () => {
                    setCroppingImage(String(reader.result));
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {draft.coverImage ? (
              <button
                type="button"
                onClick={() => setCroppingImage(draft.coverImage!)}
                className="btn sm"
              >
                ✂️ Crop / Frame
              </button>
            ) : null}
          </div>
        </div>
      </Field>

      <Field label="Difficulty">
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => set({ difficulty: d })}
              className={`flex-1 rounded-xl p-2 text-sm font-extrabold [border:var(--border-thick)] ${
                draft.difficulty === d ? "bg-lemon" : "bg-card"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={`Max points per play — ${draft.maxPoints}`}
        error={issueFor("maxPoints")}
      >
        <input
          type="range"
          className="w-full"
          min={MAX_POINTS_MIN}
          max={MAX_POINTS_MAX}
          step={MAX_POINTS_STEP}
          value={draft.maxPoints}
          onChange={(e) => set({ maxPoints: Number(e.target.value) })}
          suppressHydrationWarning
        />
      </Field>

      {draft.type === "quiz" ? (
        <QuizEditor draft={draft} set={set} issueFor={issueFor} />
      ) : null}

      {draft.type === "catch" ? (
        <Field label="What falls from the sky" error={issueFor("item")}>
          <div className="flex gap-2">
            {CATCH_ITEMS.map((item) => (
              <button
                key={item}
                aria-label={item}
                onClick={() => set({ item })}
                className={`h-14 w-14 rounded-xl [border:var(--border-thick)] ${draft.item === item ? "bg-lemon" : "bg-card"}`}
                dangerouslySetInnerHTML={{
                  __html: `<svg viewBox="-20 -20 40 40">${itemShape(item, 0, 0, 1.4)}</svg>`,
                }}
              />
            ))}
          </div>
        </Field>
      ) : null}

      {draft.type === "reflex" ? (
        <Field label="Target colour" error={issueFor("target")}>
          <div className="flex gap-2">
            {REFLEX_TARGETS.map((target) => (
              <button
                key={target}
                aria-label={target}
                onClick={() => set({ target })}
                className={`h-10 w-10 rounded-full [border:var(--border-thick)] ${draft.target === target ? "ring-4 ring-ink" : ""}`}
                style={{ background: `var(--color-${target})` }}
              />
            ))}
          </div>
        </Field>
      ) : null}

      {draft.type === "memory" ? (
        <Field
          label="Pair images"
          hint={`Up to ${MEMORY_PAIRS}. Empty slots use the built-in shape pack.`}
          error={uploadError ?? issueFor("images")}
        >
          <div className="grid grid-cols-3 gap-2">
            {draft.images.map((im, i) => (
              <div
                key={i}
                className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-card [border:var(--border-thick)]"
              >
                {im ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={im}
                      alt={`Pair ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      aria-label={`Remove image ${i + 1}`}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-paper text-xs font-extrabold [border:var(--border-thick)]"
                      onClick={() => {
                        const images = [...draft.images];
                        images[i] = null;
                        set({ images });
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-bold text-soft">{i + 1}</span>
                )}
              </div>
            ))}
          </div>
          <label className="btn sm mt-3 inline-flex">
            <span dangerouslySetInnerHTML={{ __html: icon("upload") }} /> Upload
            images
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                setUploadError(null);
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                const images = [...draft.images];
                for (const file of files) {
                  const slot = images.indexOf(null);
                  if (slot === -1) break;
                  try {
                    images[slot] = await shrinkImage(file);
                  } catch (err) {
                    setUploadError(
                      err instanceof Error
                        ? err.message
                        : "Couldn't read that image.",
                    );
                  }
                }
                set({ images });
              }}
            />
          </label>
        </Field>
      ) : null}

      {croppingImage ? (
        <CoverCropperModal
          imageSrc={croppingImage}
          onCrop={(cropped) => {
            set({ coverImage: cropped });
            setCroppingImage(null);
          }}
          onCancel={() => setCroppingImage(null)}
        />
      ) : null}
    </section>
  );
}

function QuizEditor({
  draft,
  set,
  issueFor,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  issueFor: (field: string) => string | undefined;
}) {
  const update = (i: number, patch: Partial<Draft["questions"][number]>) => {
    const questions = draft.questions.map((q, k) =>
      k === i ? { ...q, ...patch } : q,
    );
    set({ questions });
  };

  return (
    <Field
      label="Questions"
      hint="Tap a letter to mark the right answer."
      error={issueFor("questions")}
    >
      <div className="fade-in flex flex-col gap-4">
        {draft.questions.map((q, i) => (
          <div
            key={i}
            className="card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-extrabold text-soft">
                Question {i + 1}
              </span>
              {draft.questions.length > 1 ? (
                <button
                  aria-label={`Delete question ${i + 1}`}
                  className="text-xs font-extrabold text-gum"
                  onClick={() =>
                    set({
                      questions: draft.questions.filter((_, k) => k !== i),
                    })
                  }
                >
                  Delete
                </button>
              ) : null}
            </div>
            <input
              className={inputClass}
              placeholder="Type your question"
              value={q.q}
              onChange={(e) => update(i, { q: e.target.value })}
              suppressHydrationWarning
            />
            <div className="mt-2 flex flex-col gap-2">
              {q.a.map((a, k) => (
                <div key={k} className="flex items-center gap-2">
                  <button
                    aria-label={`Mark answer ${"ABCD"[k]} correct`}
                    onClick={() => update(i, { c: k })}
                    className={`h-9 w-9 shrink-0 rounded-full text-sm font-extrabold [border:var(--border-thick)] ${
                      q.c === k ? "bg-mint" : "bg-paper"
                    }`}
                  >
                    {"ABCD"[k]}
                  </button>
                  <input
                    className={inputClass}
                    placeholder={`Answer ${"ABCD"[k]}`}
                    value={a}
                    onChange={(e) =>
                      update(i, {
                        a: q.a.map((v, j) => (j === k ? e.target.value : v)),
                      })
                    }
                    suppressHydrationWarning
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {draft.questions.length < QUIZ_MAX_QUESTIONS ? (
        <button
          className="btn sm mt-3"
          onClick={() =>
            set({
              questions: [
                ...draft.questions,
                { q: "", a: ["", "", "", ""], c: 0 },
              ],
            })
          }
        >
          <span dangerouslySetInnerHTML={{ __html: icon("plus") }} /> Add
          question
        </button>
      ) : null}
    </Field>
  );
}

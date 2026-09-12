/**
 * Authoring rules for the creator studio: what makes a game draft valid, and
 * how to reduce a client-supplied config down to only the keys its template
 * actually reads.
 *
 * Pure (no DOM), and deliberately shared: the wizard imports it to gate its
 * Next button and render inline errors, and publishGame imports it as the
 * authoritative check. A rule added here applies to both at once, so the form
 * and the server can't drift apart.
 */
import { THEMES } from "@playloop/ui";
import type { ItemKind, ThemeName } from "@playloop/ui";
import type { PlayableType } from "./rules";
import type { Difficulty, QuizQuestion } from "./types";
import type { ReflexTarget } from "./templates/reflex";

export const TITLE_MAX = 26;
export const QUESTION_MAX = 120;
export const ANSWER_MAX = 60;
export const QUIZ_MIN_QUESTIONS = 2;
export const QUIZ_MAX_QUESTIONS = 8;
export const MEMORY_PAIRS = 6;

export const MAX_POINTS_MIN = 100;
export const MAX_POINTS_MAX = 400;
export const MAX_POINTS_STEP = 25;

export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
export const CATCH_ITEMS: ItemKind[] = ["star", "gem", "orb", "bean"];
export const REFLEX_TARGETS: ReflexTarget[] = ["mint", "sky", "lemon"];

/**
 * Per-image and whole-config ceilings. Custom memory images are stored inline
 * in games.config as data URLs (no Supabase Storage yet), so these are what
 * keeps a single row from growing unbounded.
 */
export const IMAGE_MAX_BYTES = 60_000;
export const CONFIG_MAX_BYTES = 400_000;

/**
 * A memory image slot must be a base64 image data URL and nothing else.
 * memory.ts interpolates these straight into an <img src> in an HTML string,
 * so anything looser (data:text/html, javascript:) would be an XSS vector.
 */
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface GameDraft {
  type: PlayableType;
  title: string;
  theme: ThemeName;
  difficulty: Difficulty;
  maxPoints: number;
  config: Record<string, unknown>;
}

/** `field` matches the draft key (or `questions.2.a.0`) so the wizard can place the message inline. */
export interface DraftIssue {
  field: string;
  message: string;
}

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

/** True for a value that is a valid, size-capped image data URL. */
export function isValidImageDataUrl(v: unknown): v is string {
  return typeof v === "string" && v.length <= IMAGE_MAX_BYTES && IMAGE_DATA_URL.test(v);
}

/**
 * Reduces an arbitrary config object to just the keys its template reads,
 * dropping anything malformed. Never throws — call validateGameDraft on the
 * result to find out whether what survived is actually publishable.
 */
export function normalizeConfig(type: PlayableType, raw: unknown): Record<string, unknown> {
  const src = (raw ?? {}) as Record<string, unknown>;

  switch (type) {
    case "quiz": {
      const list = Array.isArray(src.questions) ? src.questions : [];
      const questions: QuizQuestion[] = [];
      for (const entry of list.slice(0, QUIZ_MAX_QUESTIONS)) {
        const q = entry as Partial<QuizQuestion>;
        if (typeof q?.q !== "string") continue;
        const answers = Array.isArray(q.a) ? q.a.filter((a): a is string => typeof a === "string") : [];
        const c = Number(q.c);
        questions.push({
          q: q.q.trim().slice(0, QUESTION_MAX),
          a: answers.slice(0, 4).map((a) => a.trim().slice(0, ANSWER_MAX)),
          c: Number.isInteger(c) && c >= 0 && c <= 3 ? c : 0,
        });
      }
      return { questions };
    }
    case "catch": {
      const item = src.item as ItemKind;
      return { item: CATCH_ITEMS.includes(item) ? item : "bean" };
    }
    case "reflex": {
      const target = src.target as ReflexTarget;
      return { target: REFLEX_TARGETS.includes(target) ? target : "mint" };
    }
    case "memory": {
      const list = Array.isArray(src.images) ? src.images : [];
      const images = Array.from({ length: MEMORY_PAIRS }, (_, i) =>
        isValidImageDataUrl(list[i]) ? (list[i] as string) : null,
      );
      // All-empty is the shape-pack default; store nothing rather than six nulls.
      return images.some(Boolean) ? { images } : {};
    }
  }
}

/** Returns every reason the draft can't be published. Empty array = publishable. */
export function validateGameDraft(draft: GameDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!isNonEmptyString(draft.title, TITLE_MAX)) {
    issues.push({ field: "title", message: `Give your game a title, up to ${TITLE_MAX} characters.` });
  }
  if (!Object.hasOwn(THEMES, draft.theme)) {
    issues.push({ field: "theme", message: "Pick a cover colour." });
  }
  if (!DIFFICULTIES.includes(draft.difficulty)) {
    issues.push({ field: "difficulty", message: "Pick a difficulty." });
  }
  if (
    !Number.isInteger(draft.maxPoints) ||
    draft.maxPoints < MAX_POINTS_MIN ||
    draft.maxPoints > MAX_POINTS_MAX ||
    draft.maxPoints % MAX_POINTS_STEP !== 0
  ) {
    issues.push({
      field: "maxPoints",
      message: `Max points must be between ${MAX_POINTS_MIN} and ${MAX_POINTS_MAX}, in steps of ${MAX_POINTS_STEP}.`,
    });
  }

  const config = draft.config ?? {};

  if (draft.type === "quiz") {
    const questions = (Array.isArray(config.questions) ? config.questions : []) as QuizQuestion[];
    if (questions.length < QUIZ_MIN_QUESTIONS || questions.length > QUIZ_MAX_QUESTIONS) {
      issues.push({
        field: "questions",
        message: `Add between ${QUIZ_MIN_QUESTIONS} and ${QUIZ_MAX_QUESTIONS} questions.`,
      });
    }
    questions.forEach((q, i) => {
      if (!isNonEmptyString(q?.q, QUESTION_MAX)) {
        issues.push({ field: `questions.${i}.q`, message: "Type your question." });
      }
      const answers = Array.isArray(q?.a) ? q.a : [];
      if (answers.length !== 4) {
        issues.push({ field: `questions.${i}.a`, message: "Every question needs four answers." });
      }
      answers.forEach((a, k) => {
        if (!isNonEmptyString(a, ANSWER_MAX)) {
          issues.push({ field: `questions.${i}.a.${k}`, message: `Fill in answer ${"ABCD"[k]}.` });
        }
      });
      if (!Number.isInteger(q?.c) || q.c < 0 || q.c >= answers.length) {
        issues.push({ field: `questions.${i}.c`, message: "Mark which answer is correct." });
      }
    });
  }

  if (draft.type === "catch" && !CATCH_ITEMS.includes(config.item as ItemKind)) {
    issues.push({ field: "item", message: "Pick what falls from the sky." });
  }

  if (draft.type === "reflex" && !REFLEX_TARGETS.includes(config.target as ReflexTarget)) {
    issues.push({ field: "target", message: "Pick a target colour." });
  }

  if (draft.type === "memory") {
    const images = Array.isArray(config.images) ? config.images : [];
    if (images.length > MEMORY_PAIRS) {
      issues.push({ field: "images", message: `Up to ${MEMORY_PAIRS} images.` });
    }
    if (images.some((im) => im != null && !isValidImageDataUrl(im))) {
      issues.push({ field: "images", message: "One of those images couldn't be read — remove it and try again." });
    }
  }

  if (JSON.stringify(config).length > CONFIG_MAX_BYTES) {
    issues.push({ field: "config", message: "That's too much content for one game — try fewer or smaller images." });
  }

  return issues;
}

/** The engine needs a question count to bound a quiz's score; 0 for every other template. */
export function questionCount(type: PlayableType, config: Record<string, unknown>): number {
  if (type !== "quiz") return 0;
  return Array.isArray(config.questions) ? config.questions.length : 0;
}

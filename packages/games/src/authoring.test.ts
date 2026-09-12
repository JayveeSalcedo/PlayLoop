import { describe, expect, it } from "vitest";
import { normalizeConfig, validateGameDraft, type GameDraft } from "./authoring";

const base = { title: "Coffee Quiz", theme: "sun", difficulty: "Medium", maxPoints: 200 } as const;

function quizDraft(questions: unknown[]): GameDraft {
  return { ...base, type: "quiz", config: { questions } };
}

const goodQuestion = { q: "Which country grows the most coffee?", a: ["Brazil", "Vietnam", "Colombia", "Ethiopia"], c: 0 };

const fields = (d: GameDraft) => validateGameDraft(d).map((i) => i.field);

describe("validateGameDraft", () => {
  it("accepts a minimal valid draft of each template", () => {
    expect(validateGameDraft(quizDraft([goodQuestion, goodQuestion]))).toEqual([]);
    expect(validateGameDraft({ ...base, type: "catch", config: { item: "star" } })).toEqual([]);
    expect(validateGameDraft({ ...base, type: "reflex", config: { target: "mint" } })).toEqual([]);
    // Memory needs no config at all — empty slots fall back to the shape pack.
    expect(validateGameDraft({ ...base, type: "memory", config: {} })).toEqual([]);
  });

  it("requires between two and eight quiz questions", () => {
    expect(fields(quizDraft([goodQuestion]))).toContain("questions");
    expect(fields(quizDraft(Array(9).fill(goodQuestion)))).toContain("questions");
    expect(validateGameDraft(quizDraft(Array(8).fill(goodQuestion)))).toEqual([]);
  });

  it("rejects a question with a blank answer, and points at that answer", () => {
    const bad = { ...goodQuestion, a: ["Brazil", "", "Colombia", "Ethiopia"] };
    expect(fields(quizDraft([goodQuestion, bad]))).toContain("questions.1.a.1");
  });

  it("rejects a question with fewer than four answers", () => {
    const bad = { ...goodQuestion, a: ["Brazil", "Vietnam"] };
    expect(fields(quizDraft([goodQuestion, bad]))).toContain("questions.1.a");
  });

  it("rejects a correct-answer index outside the answer list", () => {
    expect(fields(quizDraft([goodQuestion, { ...goodQuestion, c: 4 }]))).toContain("questions.1.c");
  });

  it("requires a title of one to twenty-six characters", () => {
    expect(fields({ ...quizDraft([goodQuestion, goodQuestion]), title: "   " })).toContain("title");
    expect(fields({ ...quizDraft([goodQuestion, goodQuestion]), title: "x".repeat(27) })).toContain("title");
  });

  it("holds max points to the 100-400 range in steps of 25", () => {
    const d = quizDraft([goodQuestion, goodQuestion]);
    expect(fields({ ...d, maxPoints: 90 })).toContain("maxPoints");
    expect(fields({ ...d, maxPoints: 410 })).toContain("maxPoints");
    expect(fields({ ...d, maxPoints: 210 })).toContain("maxPoints");
    expect(validateGameDraft({ ...d, maxPoints: 225 })).toEqual([]);
  });

  it("rejects an unknown theme, catch item or reflex target", () => {
    expect(fields({ ...quizDraft([goodQuestion, goodQuestion]), theme: "chartreuse" })).toContain("theme");
    expect(fields({ ...base, type: "catch", config: { item: "banana" } })).toContain("item");
    expect(fields({ ...base, type: "reflex", config: { target: "puce" } })).toContain("target");
  });

  it("rejects a memory image that isn't an image data URL", () => {
    const draft: GameDraft = {
      ...base,
      type: "memory",
      config: { images: ["data:text/html;base64,PHNjcmlwdD4="] },
    };
    expect(fields(draft)).toContain("images");
  });
});

describe("normalizeConfig", () => {
  it("keeps only the keys its template reads", () => {
    const out = normalizeConfig("catch", { item: "gem", questions: [goodQuestion], evil: true });
    expect(out).toEqual({ item: "gem" });
  });

  it("falls back to a default for an unknown item or target", () => {
    expect(normalizeConfig("catch", { item: "banana" })).toEqual({ item: "bean" });
    expect(normalizeConfig("reflex", { target: "puce" })).toEqual({ target: "mint" });
  });

  it("trims quiz content and caps it at eight questions", () => {
    const out = normalizeConfig("quiz", {
      questions: Array(12).fill({ q: "  Why?  ", a: [" A ", "B", "C", "D"], c: 1 }),
    });
    const questions = out.questions as { q: string; a: string[] }[];
    expect(questions).toHaveLength(8);
    expect(questions[0]?.q).toBe("Why?");
    expect(questions[0]?.a[0]).toBe("A");
  });

  it("drops a non-image data URL but keeps a valid image beside it", () => {
    const ok = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const out = normalizeConfig("memory", { images: ["data:text/html;base64,PHNjcmlwdD4=", ok] });
    expect(out.images).toEqual([null, ok, null, null, null, null]);
  });

  it("stores nothing when every memory slot is empty", () => {
    expect(normalizeConfig("memory", { images: [null, null] })).toEqual({});
  });
});
